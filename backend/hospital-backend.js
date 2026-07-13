const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'hospital_db'
};

let pool;

async function initDatabase() {
    let retries = 10;
    while (retries > 0) {
        try {
            pool = mysql.createPool(dbConfig);
            // ทดสอบการเชื่อมต่อ
            await pool.query('SELECT 1');
            console.log('🐬 เชื่อมต่อ MySQL สำเร็จแล้ว!');

            // ตาราง patient_visits
            await pool.query(`
                CREATE TABLE IF NOT EXISTS patient_visits (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_type VARCHAR(50) NOT NULL,
                    user_code VARCHAR(50),
                    full_name VARCHAR(100) NOT NULL,
                    department VARCHAR(100),
                    symptoms TEXT NOT NULL,
                    temperature DECIMAL(3,1),
                    medicine_type VARCHAR(50),
                    medicine_name VARCHAR(100),
                    medicine_qty VARCHAR(50),
                    treatment_status VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // ตาราง users สำหรับระบบ login
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL COMMENT 'รหัสประจำตัว',
                    password VARCHAR(255) NOT NULL COMMENT 'เลขประจำตัวประชาชน',
                    full_name VARCHAR(100),
                    class_group VARCHAR(100),
                    birthdate VARCHAR(50),
                    student_status VARCHAR(50),
                    role VARCHAR(20) DEFAULT 'student',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            // สร้าง admin user เริ่มต้น (ถ้ายังไม่มี)
            await pool.query(`
                INSERT IGNORE INTO users (username, password, full_name, role)
                VALUES ('admin', 'adminLTC', 'ผู้ดูแลระบบ', 'admin')
            `);
            console.log('✅ ตรวจสอบตาราง users และ patient_visits เรียบร้อย');
            return; // สำเร็จแล้ว - ออกจากฟังก์ชัน
        } catch (err) {
            console.error(`❌ เกิดข้อผิดพลาดกับ MySQL (กำลังลองใหม่ เหลือสิทธิ์อีก ${retries - 1} ครั้ง):`, err.message);
            retries -= 1;
            if (retries === 0) {
                console.error('❌ ไม่สามารถเชื่อมต่อกับ Database ได้หลังจากพยายามหลายครั้ง');
                process.exit(1); // ปิดการทำงานของแอปเพื่อให้ Docker รีสตาร์ทคอนเทนเนอร์ (ตามนโยบาย restart: always ใน docker-compose)
            }
            // รอ 3 วินาทีก่อนลองใหม่
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}
initDatabase();

// ─────────────────────────────────────────
// API: Login
// ─────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const usernameInput = (req.body.username || '').trim();
    const passwordInput = (req.body.password || '').trim();

    if (!usernameInput) {
        return res.status(400).json({ message: 'กรุณากรอกรหัสนักศึกษา หรือเลขบัตรประชาชนสำหรับเข้าใช้' });
    }

    const isThaiID = usernameInput.length === 13 && /^\d+$/.test(usernameInput);

    if (!passwordInput && !isThaiID) {
        return res.status(400).json({ message: 'กรุณากรอกรหัสผ่าน (เลขบัตรประชาชน 13 หลัก)' });
    }

    try {
        if (isThaiID) {
            // ค้นหาในฐานข้อมูลของเราก่อน โดยหาว่าเล็ขบัตรจับคู่ฟิลด์ password หรือ username หรือเปล่า
            const [rows] = await pool.query(
                'SELECT id, username, full_name, class_group, role FROM users WHERE password = ? OR username = ?',
                [usernameInput, usernameInput]
            );

            if (rows.length > 0) {
                const user = rows[0];
                // ปล่อยให้ครู พนักงาน หรือผู้ดูแลระบบ เข้าใช้งานทันทีโดยไม่ต้องรหัสผ่านซ้ำอีกรอบ
                if (user.role === 'teacher' || user.role === 'staff' || user.role === 'admin') {
                    return res.json({ message: 'เข้าสู่ระบบสำเร็จ (อาจารย์/บุคลากร)', user });
                } else {
                    // หากเป็นนักเรียน (student) ไม่อนุญาตให้ล็อกอินพาสส์เวิร์ดเลส
                    if (!passwordInput) {
                        return res.status(401).json({ message: 'บทบาทนักศึกษา ต้องระบุกรอกรหัสนักศึกษาและรหัสผ่านคู่กัน' });
                    }
                    if (user.password === passwordInput) {
                        return res.json({ message: 'เข้าสู่ระบบสำเร็จ', user });
                    } else {
                        return res.status(401).json({ message: 'ข้อมูลระบุตัวตนไม่ถูกต้อง' });
                    }
                }
            } else {
                // หากไม่เจอบุคคลใน DB ท้องถิ่น ให้ไปโทรเรียก API รายการนอก
                const apiToken = process.env.LTC_API_TOKEN;
                if (!apiToken) {
                    return res.status(500).json({ message: 'เซิร์ฟเวอร์ไม่ได้ตั้งค่า LTC_API_TOKEN' });
                }

                const apiResponse = await fetch('https://loeitech.ac.th/api/check_thai_id.php', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ thai_id: usernameInput })
                });

                const data = await apiResponse.json();

                if (apiResponse.ok && data.status === 'success') {
                    // ลงทะเบียนเป็นบทบาทครู
                    const defaultName = 'อาจารย์/บุคลากรใหม่';
                    const defaultRole = 'teacher';

                    await pool.query(
                        `INSERT INTO users (username, password, full_name, role, class_group)
                         VALUES (?, ?, ?, ?, ?)`,
                        [usernameInput, usernameInput, defaultName, defaultRole, 'แผนกวิชาทั่วไป']
                    );

                    const [newRows] = await pool.query(
                        'SELECT id, username, full_name, class_group, role FROM users WHERE username = ?',
                        [usernameInput]
                    );

                    return res.json({
                        message: 'ลงทะเบียนเข้าใช้งานครั้งแรกสำเร็จ (อาจารย์/บุคลากร)',
                        user: newRows[0]
                    });
                } else {
                    return res.status(401).json({ message: 'ไม่พบเลขบัตรประจำตัวประชาชนนี้ในระบบทะเบียนของวิทยาลัย' });
                }
            }
        } else {
            // ล็อกอินแบบปกติ (กรอก รหัสนักศึกษา + รหัสบัตรประชาชน)
            const [rows] = await pool.query(
                'SELECT id, username, full_name, class_group, role FROM users WHERE username = ? AND password = ?',
                [usernameInput, passwordInput]
            );

            if (rows.length === 0) {
                return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
            }
            return res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: rows[0] });
        }
    } catch (error) {
        console.error("Login route error:", error);
        res.status(500).json({ message: 'ข้อผิดพลาดระบบสำหรับตรวจสอบการเข้าสู่ระบบ', error: error.message });
    }
});

// API: ดึงข้อมูลผู้ใช้ตาม รหัสนักศึกษา หรือ เลขบัตรประชาชน
app.get('/api/users/:identifier', async (req, res) => {
    const { identifier } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT id, username, full_name, class_group, role FROM users WHERE username = ? OR password = ?',
            [identifier.trim(), identifier.trim()]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลบุคคลนี้ในฐานข้อมูล' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการค้นหาข้อมูล', error: error.message });
    }
});

// ─────────────────────────────────────────
// API: ตรวจสอบเลขบัตรประชาชนผ่าน External LTC API
// ─────────────────────────────────────────
app.post('/api/verify-thai-id', async (req, res) => {
    const { thai_id } = req.body;
    if (!thai_id || !/^\d{13}$/.test(thai_id)) {
        return res.status(400).json({ message: 'กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง (ตัวเลขล้วน)' });
    }

    const apiToken = process.env.LTC_API_TOKEN;
    if (!apiToken) {
        return res.status(500).json({ message: 'เซิร์ฟเวอร์ไม่ได้กำหนด API Token สำหรับ LTC (LTC_API_TOKEN)' });
    }

    try {
        const apiResponse = await fetch('https://loeitech.ac.th/api/check_thai_id.php', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ thai_id: thai_id.trim() })
        });

        const data = await apiResponse.json();

        if (apiResponse.ok && data.status === 'success') {
            return res.json({
                verified: true,
                message: 'ยืนยันรหัสบัตรประชาชนผ่านระบบทะเบียนวิทยาลัยสำเร็จ',
                thai_id: data.thai_id
            });
        } else {
            return res.status(apiResponse.status || 400).json({
                verified: false,
                message: data.message || 'ไม่พบเลขบัตรประชาชนนี้ในระบบทะเบียนวิทยาลัย',
                hint: data.hint || null
            });
        }
    } catch (error) {
        console.error('LTC API Error:', error);
        return res.status(500).json({
            verified: false,
            message: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ตรวจสอบของวิทยาลัยได้',
            error: error.message
        });
    }
});

// ─────────────────────────────────────────
// API: Import users (bulk) จาก Excel script
// ─────────────────────────────────────────
app.post('/api/users/import', async (req, res) => {
    const { users } = req.body; // array of user objects
    if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ message: 'ไม่มีข้อมูล users ที่จะ import' });
    }
    let inserted = 0, skipped = 0;
    for (const u of users) {
        try {
            await pool.query(
                `INSERT IGNORE INTO users (username, password, full_name, class_group, birthdate, student_status)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [u.username, u.password, u.full_name, u.class_group, u.birthdate, u.student_status]
            );
            inserted++;
        } catch (e) {
            skipped++;
        }
    }
    res.json({ message: `Import สำเร็จ: เพิ่ม ${inserted} คน, ข้าม ${skipped} คน (ซ้ำ)` });
});

// API: ดึงข้อมูลของวันนี้
app.get('/api/patients/today', async (req, res) => {
    const { user_code, role } = req.query;
    try {
        let query = `SELECT * FROM patient_visits WHERE DATE(created_at) = CURDATE()`;
        const params = [];
        
        if (role !== 'admin') {
            if (!user_code) {
                return res.json([]);
            }
            query += ` AND user_code = ?`;
            params.push(user_code);
        }
        
        query += ` ORDER BY created_at DESC`;
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'ดึงข้อมูลล้มเหลว', error: error.message });
    }
});

// API: ดึงรายชื่อผู้มาใช้บริการทั้งหมดตามช่วงเวลา
app.get('/api/patients/list-by-period', async (req, res) => {
    const period = req.query.period || 'week';
    const search = req.query.search || '';
    const { user_code, role } = req.query;
    let dateCondition = '';

    if (period === 'week') dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    else if (period === 'month') dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    else if (period === 'term') dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 4 MONTH)';

    const conditions = [];
    if (dateCondition) conditions.push(dateCondition);
    if (search) {
        conditions.push(`(full_name LIKE ? OR user_code LIKE ? OR department LIKE ? OR symptoms LIKE ?)`);
    }
    if (role !== 'admin') {
        if (!user_code) {
            return res.json([]);
        }
        conditions.push(`user_code = ?`);
    }
    
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    
    const params = [];
    if (search) {
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role !== 'admin' && user_code) {
        params.push(user_code);
    }

    try {
        const [rows] = await pool.query(
            `SELECT id, user_type, user_code, full_name, department, symptoms, temperature,
                    medicine_type, medicine_name, medicine_qty, treatment_status, created_at
             FROM patient_visits ${whereClause} ORDER BY created_at DESC`,
            params
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'ดึงรายชื่อล้มเหลว', error: error.message });
    }
});

// API: บันทึกข้อมูลใหม่
app.post('/api/patients', async (req, res) => {
    const {
        userType, studentId, fullName, department,
        symptoms, temperature, medicineType, medicineName, medicineQty, status
    } = req.body;

    try {
        const query = `
            INSERT INTO patient_visits 
            (user_type, user_code, full_name, department, symptoms, temperature, medicine_type, medicine_name, medicine_qty, treatment_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.query(query, [
            userType, studentId || null, fullName, department || null,
            symptoms, temperature || null, medicineType || null, medicineName || null, medicineQty || null, status
        ]);

        const [newRow] = await pool.query('SELECT * FROM patient_visits WHERE id = ?', [result.insertId]);
        res.status(201).json({ message: 'บันทึกสำเร็จ', data: newRow[0] });
    } catch (error) {
        res.status(400).json({ message: 'บันทึกล้มเหลว', error: error.message });
    }
});

// API: ลบข้อมูลผู้ป่วย
app.delete('/api/patients/:id', async (req, res) => {
    const { id } = req.params;
    const { role } = req.query;
    
    if (role !== 'admin') {
        return res.status(403).json({ message: 'ไม่มีสิทธิ์ลบข้อมูล' });
    }
    
    try {
        const [result] = await pool.query('DELETE FROM patient_visits WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลที่ต้องการลบ' });
        }
        res.json({ message: 'ลบข้อมูลสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'ลบข้อมูลล้มเหลว', error: error.message });
    }
});

// API: แก้ไขข้อมูลผู้รับบริการ
app.put('/api/patients/:id', async (req, res) => {
    const { id } = req.params;
    const {
        userType, studentId, fullName, department,
        symptoms, temperature, medicineType, medicineName, medicineQty, status,
        requestorCode, requestorRole
    } = req.body;

    try {
        // ดึงข้อมูลเดิมมาตรวจสอบสิทธิ์ก่อน
        const [existing] = await pool.query('SELECT * FROM patient_visits WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลที่ต้องการแก้ไข' });
        }

        // ถ้าร้องขอโดยผู้ใช้ทั่วไป (ที่ไม่ใช่ admin) ให้เช็กว่า user_code ตรงกันหรือไม่
        if (requestorRole !== 'admin' && existing[0].user_code !== requestorCode) {
            return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขข้อมูลของผู้อื่น' });
        }

        const query = `
            UPDATE patient_visits 
            SET user_type = ?, user_code = ?, full_name = ?, department = ?, 
                symptoms = ?, temperature = ?, medicine_type = ?, medicine_name = ?, medicine_qty = ?, treatment_status = ?
            WHERE id = ?
        `;
        await pool.query(query, [
            userType, studentId || null, fullName, department || null,
            symptoms, temperature || null, medicineType || null, medicineName || null, medicineQty || null, status,
            id
        ]);

        const [updatedRow] = await pool.query('SELECT * FROM patient_visits WHERE id = ?', [id]);
        res.json({ message: 'แก้ไขข้อมูลสำเร็จ', data: updatedRow[0] });
    } catch (error) {
        res.status(400).json({ message: 'แก้ไขข้อมูลล้มเหลว', error: error.message });
    }
});

// 🔥 API อัปเดต: ดึงสถิติบุคคล + สรุปยอดการใช้ยาแยกตามช่วงเวลา
app.get('/api/patients/stats-by-period', async (req, res) => {
    const { role } = req.query;
    if (role !== 'admin') {
        return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลสถิติ' });
    }
    
    const period = req.query.period || 'week';
    let dateCondition = '';

    if (period === 'week') {
        dateCondition = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    } else if (period === 'month') {
        dateCondition = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    } else if (period === 'term') {
        dateCondition = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 4 MONTH)';
    }

    try {
        // 1. ดึงสถิติจำนวนคนแยกประเภท
        const [totalRes] = await pool.query(`SELECT COUNT(*) as count FROM patient_visits ${dateCondition}`);
        const [studentRes] = await pool.query(`SELECT COUNT(*) as count FROM patient_visits ${dateCondition} ${dateCondition ? 'AND' : 'WHERE'} user_type = "นักเรียน/นักศึกษา"`);
        const [teacherRes] = await pool.query(`SELECT COUNT(*) as count FROM patient_visits ${dateCondition} ${dateCondition ? 'AND' : 'WHERE'} user_type = "ครู"`);
        const [staffRes] = await pool.query(`SELECT COUNT(*) as count FROM patient_visits ${dateCondition} ${dateCondition ? 'AND' : 'WHERE'} user_type = "เจ้าหน้าที่"`);

        // 2. 🔥 ดึงรายละเอียดเพื่อไปคำนวณหายอดรวมและการจ่ายยาทีละรายการใน JS
        const medicineQuery = `
            SELECT medicine_type, medicine_name, medicine_qty
            FROM patient_visits 
            ${dateCondition} ${dateCondition ? 'AND' : 'WHERE'} medicine_name IS NOT NULL AND medicine_name != ""
        `;
        const [medicineRows] = await pool.query(medicineQuery);

        const medSummary = {};
        let grandTotalMeds = 0;

        for (const row of medicineRows) {
            const key = `${row.medicine_type}|||${row.medicine_name}`;

            // ดึงตัวเลขจากค่าที่กรอก เช่น "2 เม็ด" -> 2, "1 ชิ้น" -> 1
            const qtyStr = row.medicine_qty ? String(row.medicine_qty).trim() : '0';
            const numMatch = qtyStr.match(/(\d+(\.\d+)?)/);
            const qtyNum = numMatch ? parseFloat(numMatch[1]) : 1; // ถ้าไม่มีตัวเลข หรือค่าว่าง ให้ถือว่าจ่าย 1 ชิ้น

            // คัดแยกหน่วยภาษาไทย/อังกฤษออกไป
            let unit = qtyStr.replace(/[\d\s.]/g, '').trim();
            if (!unit) {
                if (row.medicine_type === 'ยากิน') unit = 'เม็ด';
                else if (row.medicine_type === 'ยาทาภายนอก') unit = 'หลอด';
                else if (row.medicine_type === 'อุปกรณ์ทำแผล') unit = 'ชิ้น';
                else unit = 'เม็ด';
            }

            if (!medSummary[key]) {
                medSummary[key] = {
                    medicine_type: row.medicine_type,
                    medicine_name: row.medicine_name,
                    times_used: 0,
                    total_qty: 0,
                    unit: unit
                };
            }
            medSummary[key].times_used += 1;
            medSummary[key].total_qty += qtyNum;
            grandTotalMeds += qtyNum;
        }

        const sortedMedicines = Object.values(medSummary).sort((a, b) => b.times_used - a.times_used);

        res.json({
            total: totalRes[0].count,
            student: studentRes[0].count,
            teacher: teacherRes[0].count,
            staff: staffRes[0].count,
            totalMedicineQty: grandTotalMeds,
            medicines: sortedMedicines
        });
    } catch (error) {
        res.status(500).json({ message: 'ไม่สามารถดึงสถิติได้', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Backend รันอยู่ที่ http://localhost:${PORT}`);
});