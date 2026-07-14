/**
 * Script สำหรับอ่านไฟล์ Excel แล้วนำเข้าข้อมูลนักศึกษาเข้า database
 * ผ่าน API /api/users/import
 */

const XLSX = require('xlsx');
const path = require('path');

const API_URL = process.env.API_URL || 'http://192.168.10.202:5000';
const EXCEL_FILE = path.resolve(__dirname, '20260706094903.xlsx');

async function main() {
    console.log(`📄 กำลังอ่านไฟล์ Excel: ${EXCEL_FILE}`);
    
    const workbook = XLSX.readFile(EXCEL_FILE);
    const sheetNames = workbook.SheetNames;
    console.log(`📋 พบ ${sheetNames.length} ชีท: ${sheetNames.join(', ')}`);
    
    let allUsers = [];
    
    for (const sheetName of sheetNames) {
        console.log(`\n🔍 กำลังอ่านชีท: "${sheetName}"`);
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rows.length === 0) {
            console.log(`  ⚠️ ชีทว่างเปล่า ข้าม...`);
            continue;
        }
        
        // หาแถว header ที่มีคอลัมน์ "รหัสประจำตัว"
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(20, rows.length); r++) {
            const row = rows[r];
            if (row && Array.from(row).some(cell => cell != null && String(cell).includes('รหัสประจำตัว'))) {
                headerRowIdx = r;
                break;
            }
        }
        
        if (headerRowIdx === -1) {
            console.log(`  ⚠️ ไม่พบแถวหัวตารางที่มี "รหัสประจำตัว" ข้าม...`);
            continue;
        }
        
        const headers = Array.from(rows[headerRowIdx]).map(h => String(h != null ? h : '').trim());
        console.log(`  📊 พบ headers: ${headers.filter(h => h).join(', ')}`);
        
        const colUsername = headers.findIndex(h => h && h.includes('รหัสประจำตัว'));
        const colPassword = headers.findIndex(h => h && h.includes('เลขประจำตัวประชาชน'));
        const colFullName = headers.findIndex(h => h && (h.includes('ชื่อ - นามสกุล') || h.includes('ชื่อ-นามสกุล') || h === 'ชื่อ' || h.includes('คำนำหน้า')));
        const colClassGroup = headers.findIndex(h => h && h.includes('กลุ่มเรียน'));
        const colBirthdate = headers.findIndex(h => h && (h.includes('เกิด') || h.includes('วันเกิด')));
        const colStatus = headers.findIndex(h => h && h.includes('สถานะ'));
        
        console.log(`  🔑 colUsername=${colUsername}, colPassword=${colPassword}, colFullName=${colFullName}, colClassGroup=${colClassGroup}, colBirthdate=${colBirthdate}, colStatus=${colStatus}`);
        
        if (colUsername === -1 || colPassword === -1) {
            console.log(`  ⚠️ ไม่พบคอลัมน์ "รหัสประจำตัว" หรือ "เลขประจำตัวประชาชน" ข้าม...`);
            continue;
        }
        
        let sheetUsers = [];
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || !row[colUsername] || !row[colPassword]) continue;
            
            const username = String(row[colUsername]).trim();
            const password = String(row[colPassword]).trim();
            if (!username || !password) continue;
            
            let fullName = '';
            if (colFullName !== -1) {
                // ลองรวม คำนำหน้า + ชื่อ + นามสกุล (อาจอยู่ในคอลัมน์ถัดไป)
                const col1 = String(row[colFullName] || '').trim();
                const col2 = String(row[colFullName + 1] || '').trim();
                const col3 = String(row[colFullName + 2] || '').trim();
                
                if (col2 || col3) {
                    // มีหลายคอลัมน์ (คำนำหน้า, ชื่อ, นามสกุล)
                    fullName = `${col1}${col2} ${col3}`.trim();
                } else {
                    fullName = col1;
                }
            }
            
            const classGrp = colClassGroup !== -1 ? String(row[colClassGroup] || '').trim() : '';
            const birthdate = colBirthdate !== -1 ? String(row[colBirthdate] || '').trim() : '';
            const status = colStatus !== -1 ? String(row[colStatus] || '').trim() : '';
            
            sheetUsers.push({
                username,
                password,
                full_name: fullName,
                class_group: classGrp || sheetName, // ใช้ชื่อ sheet เป็น class_group ถ้าไม่มีคอลัมน์
                birthdate,
                student_status: status
            });
        }
        
        console.log(`  ✅ พบนักศึกษา ${sheetUsers.length} คนในชีทนี้`);
        if (sheetUsers.length > 0) {
            console.log(`  📝 ตัวอย่าง: ${sheetUsers[0].username} - ${sheetUsers[0].full_name} (${sheetUsers[0].class_group})`);
        }
        allUsers = allUsers.concat(sheetUsers);
    }
    
    console.log(`\n📊 รวมทั้งหมด: ${allUsers.length} รายการ`);
    
    if (allUsers.length === 0) {
        console.log('❌ ไม่มีข้อมูลที่จะนำเข้า');
        return;
    }
    
    // ส่งข้อมูลเป็น batch (ทีละ 200 คน)
    const BATCH_SIZE = 200;
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
        const batch = allUsers.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allUsers.length / BATCH_SIZE);
        
        console.log(`\n📤 กำลังส่ง batch ${batchNum}/${totalBatches} (${batch.length} รายการ)...`);
        
        try {
            const response = await fetch(`${API_URL}/api/users/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users: batch })
            });
            
            const data = await response.json();
            console.log(`  📬 ผลลัพธ์: ${data.message}`);
            
            // parse จำนวนจาก message
            const insertMatch = data.message && data.message.match(/เพิ่ม (\d+)/);
            const skipMatch = data.message && data.message.match(/ข้าม (\d+)/);
            if (insertMatch) totalInserted += parseInt(insertMatch[1]);
            if (skipMatch) totalSkipped += parseInt(skipMatch[1]);
        } catch (err) {
            console.error(`  ❌ Error ในการส่ง batch ${batchNum}:`, err.message);
        }
    }
    
    console.log(`\n🎉 นำเข้าเสร็จสิ้น!`);
    console.log(`   ✅ เพิ่มใหม่: ${totalInserted} คน`);
    console.log(`   ⏭️ ข้าม (ซ้ำ): ${totalSkipped} คน`);
    console.log(`   📊 รวมทั้งหมดที่ประมวลผล: ${allUsers.length} คน`);
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
