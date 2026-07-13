# ============================================================
# import_users.ps1
# อ่านข้อมูลนักเรียนจาก Excel แล้ว import เข้า MariaDB
# ผ่าน API ของ backend (ต้องรัน Docker ก่อน)
# ============================================================

$excelPath  = 'c:\Users\Korarak\Desktop\web-Ltc\20260706094903.xlsx'
$apiUrl     = 'http://localhost:5000/api/users/import'

Write-Host "📂 กำลังเปิดไฟล์ Excel..." -ForegroundColor Cyan

# เปิด Excel
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($excelPath)
$ws = $wb.Sheets.Item(1)

$usedRange = $ws.UsedRange
$rows      = $usedRange.Rows.Count
$cols      = $usedRange.Columns.Count

Write-Host "📊 พบข้อมูล $rows แถว, $cols คอลัมน์" -ForegroundColor Yellow

# หา header row (หาแถวที่มีคำว่า "รหัสประจำตัว")
$headerRow = 0
for ($r = 1; $r -le [Math]::Min(10, $rows); $r++) {
    for ($c = 1; $c -le $cols; $c++) {
        if ($ws.Cells($r, $c).Text -match "รหัสประจำตัว") {
            $headerRow = $r
            break
        }
    }
    if ($headerRow -gt 0) { break }
}

if ($headerRow -eq 0) {
    Write-Host "❌ ไม่พบ header row กรุณาตรวจสอบไฟล์ Excel" -ForegroundColor Red
    $wb.Close($false); $excel.Quit()
    exit
}

Write-Host "✅ พบ Header ที่แถว: $headerRow" -ForegroundColor Green

# อ่าน headers เพื่อหา column index
$headers = @{}
for ($c = 1; $c -le $cols; $c++) {
    $h = $ws.Cells($headerRow, $c).Text.Trim()
    $headers[$h] = $c
    Write-Host "  Col $c : $h"
}

# Map column names (ยืดหยุ่น - รองรับชื่อต่างๆ)
function Get-ColIndex($map, [string[]]$candidates) {
    foreach ($key in $candidates) {
        foreach ($h in $map.Keys) {
            if ($h -match [regex]::Escape($key) -or $key -match [regex]::Escape($h)) {
                return $map[$h]
            }
        }
    }
    return 0
}

$colUsername      = Get-ColIndex $headers @("รหัสประจำตัว")
$colPassword      = Get-ColIndex $headers @("เลขประจำตัวประชาชน")
$colFullName      = Get-ColIndex $headers @("ชื่อ - นามสกุล", "ชื่อ-นามสกุล", "ชื่อ")
$colClassGroup    = Get-ColIndex $headers @("กลุ่มเรียน")
$colBirthdate     = Get-ColIndex $headers @("ว.ด.ป. เกิด", "ว.ด.ป.เกิด", "วันเกิด")
$colStatus        = Get-ColIndex $headers @("สถานะนักเรียน", "สถานะ")

Write-Host ""
Write-Host "🗺️  Column Mapping:" -ForegroundColor Cyan
Write-Host "  username (รหัสประจำตัว)       = Col $colUsername"
Write-Host "  password (เลขประจำตัวประชาชน) = Col $colPassword"
Write-Host "  full_name (ชื่อ-นามสกุล)      = Col $colFullName"
Write-Host "  class_group (กลุ่มเรียน)       = Col $colClassGroup"
Write-Host "  birthdate (ว.ด.ป.เกิด)         = Col $colBirthdate"
Write-Host "  student_status (สถานะ)         = Col $colStatus"
Write-Host ""

if ($colUsername -eq 0 -or $colPassword -eq 0) {
    Write-Host "❌ ไม่พบ column 'รหัสประจำตัว' หรือ 'เลขประจำตัวประชาชน'" -ForegroundColor Red
    $wb.Close($false); $excel.Quit()
    exit
}

# อ่านข้อมูลทุกแถว (ข้ามแถว header)
$users = @()
$dataStart = $headerRow + 1

for ($r = $dataStart; $r -le $rows; $r++) {
    $username = $ws.Cells($r, $colUsername).Text.Trim()
    $password = $ws.Cells($r, $colPassword).Text.Trim()

    # ข้ามแถวที่ไม่มีรหัส
    if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
        continue
    }

    $fullName = ""
    if ($colFullName -gt 0) {
        $prefix    = $ws.Cells($r, $colFullName).Text.Trim()
        $firstName = $ws.Cells($r, $colFullName + 1).Text.Trim()
        $lastName  = $ws.Cells($r, $colFullName + 2).Text.Trim()
        $fullName  = "$prefix$firstName $lastName"
    }
    $classGrp  = if ($colClassGroup -gt 0) { $ws.Cells($r, $colClassGroup).Text.Trim() } else { "" }
    $birthdate = if ($colBirthdate -gt 0)  { $ws.Cells($r, $colBirthdate).Text.Trim()  } else { "" }
    $status    = if ($colStatus -gt 0)     { $ws.Cells($r, $colStatus).Text.Trim()     } else { "" }

    $users += @{
        username       = $username
        password       = $password
        full_name      = $fullName
        class_group    = $classGrp
        birthdate      = $birthdate
        student_status = $status
    }
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Host "📋 อ่านข้อมูลได้ทั้งหมด $($users.Count) รายการ" -ForegroundColor Green

if ($users.Count -eq 0) {
    Write-Host "⚠️  ไม่มีข้อมูลที่จะ import" -ForegroundColor Yellow
    exit
}

# ส่งข้อมูลไปยัง API
Write-Host "🚀 กำลัง import ไปยัง $apiUrl ..." -ForegroundColor Cyan

$body = @{ users = $users } | ConvertTo-Json -Depth 5 -Compress

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method POST `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

    Write-Host ""
    Write-Host "✅ $($response.message)" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "❌ เกิดข้อผิดพลาด: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   ตรวจสอบว่า Docker กำลังรันอยู่และ backend พร้อมใช้งานที่ port 5000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🏁 เสร็จสิ้น!" -ForegroundColor Cyan
