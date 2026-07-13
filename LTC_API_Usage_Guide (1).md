# คู่มือการใช้งาน API ตรวจสอบเลขบัตรประชาชน (Loei Technical College)

## Base URL
```
https://loeitech.ac.th
```

## Authentication

ทุกคำขอต้องแนบ Token ผ่าน HTTP Header `Authorization` ในรูปแบบ Bearer Token:

```
Authorization: Bearer <API_TOKEN>
```

Token จะได้รับจากผู้ดูแลระบบเมื่อสร้าง Token ใหม่ในหน้า "จัดการ API Tokens" (แสดงให้เห็นเพียงครั้งเดียวตอนสร้าง กรุณาเก็บรักษาไว้อย่างปลอดภัย)

---

## Endpoint: ตรวจสอบเลขบัตรประชาชน

- **URL**: `/api/check_thai_id.php`
- **Method**: `GET` หรือ `POST`
- **Content-Type (สำหรับ POST)**: `application/json`

### พารามิเตอร์

| ชื่อ | ชนิดข้อมูล | จำเป็น | คำอธิบาย |
|---|---|---|---|
| `thai_id` | string | ใช่ | เลขบัตรประจำตัวประชาชน 13 หลัก (ตัวเลขล้วน) |

### ตัวอย่างการเรียกใช้งาน

**POST**
```bash
curl -X POST "https://loeitech.ac.th/api/check_thai_id.php" \
  -H "Authorization: Bearer ltcapi_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"thai_id":"1234567890123"}'
```

**GET**
```bash
curl "https://loeitech.ac.th/api/check_thai_id.php?thai_id=1234567890123" \
  -H "Authorization: Bearer ltcapi_xxxxxxxxxxxxxxxxxxxx"
```

**PHP**
```php
$ch = curl_init("https://loeitech.ac.th/api/check_thai_id.php");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer ltcapi_xxxxxxxxxxxxxxxxxxxx",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode(["thai_id" => "1234567890123"]),
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;
```

**JavaScript (fetch)**
```javascript
const res = await fetch("https://loeitech.ac.th/api/check_thai_id.php", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ltcapi_xxxxxxxxxxxxxxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ thai_id: "1234567890123" }),
});
const data = await res.json();
```

### รูปแบบการตอบกลับ (Response)

| HTTP Status | สถานการณ์ | ตัวอย่าง Response |
|---|---|---|
| `200 OK` | พบข้อมูลในระบบ | `{"status":"success","message":"Found","thai_id":"1234567890123"}` |
| `404 Not Found` | ไม่พบข้อมูล | `{"status":"error","message":"Not Found"}` |
| `400 Bad Request` | รูปแบบเลขบัตรไม่ถูกต้อง (ไม่ใช่เลข 13 หลัก) | `{"status":"error","message":"Invalid Thai ID format (must be 13 digits)"}` |
| `401 Unauthorized` | ไม่ได้แนบ Token หรือ Token ไม่ถูกต้อง/ถูก Revoke/หมดอายุ | `{"status":"error","message":"Unauthorized: valid Bearer token required","hint":"Authorization: Bearer ltcapi_xxxxxx"}` |
| `405 Method Not Allowed` | เรียกด้วย Method อื่นที่ไม่ใช่ GET/POST | `{"status":"error","message":"Method Not Allowed"}` |

---

## ข้อควรทราบ

- Token แต่ละอันสามารถถูก **Revoke** หรือ **ตั้งวันหมดอายุ** ได้จากหน้าจัดการ API Tokens โดยผู้ดูแลระบบ
- ระบบจะบันทึกจำนวนครั้งที่เรียกใช้งาน (usage count) และเวลาที่ใช้งานล่าสุดของแต่ละ Token โดยอัตโนมัติ
- ห้ามเผยแพร่ Token ต่อสาธารณะหรือฝังไว้ใน Client-side code (เช่น หน้าเว็บ, แอปมือถือที่ decompile ได้) ให้เรียกใช้งานผ่าน Server-side เท่านั้น
- หากต้องการ Token ใหม่ หรือ Token เดิมหมดอายุ/ถูก Revoke กรุณาติดต่อผู้ดูแลระบบของวิทยาลัย
