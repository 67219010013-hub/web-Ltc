# 🏥 ระบบจัดการห้องพยาบาล - วิทยาลัยเทคนิคเลย (LTC Hospital Management)

ระบบนี้ถูกพัฒนาโดยแยกโครงสร้างแบบ Multi-Container Docker ดังนี้:
1. **Frontend**: ใช้ Nginx ในการให้บริการหน้าเว็บแบบ Static HTML (`frontend.html`)
2. **Backend**: ใช้ Node.js (Express) เป็น API ให้บริการอ่าน/เขียน ข้อมูล
3. **Database**: ใช้ MariaDB ในการจัดเก็บข้อมูลการเข้าห้องพยาบาล
4. **Database GUI Manager**: ใช้ phpMyAdmin เพื่อจัดการและเรียกดูตารางข้อมูลใน Database ได้อย่างง่ายดาย

---

## 🚀 วิธีการรันระบบด้วย Docker

ตรวจสอบให้แน่ใจว่าติดตั้ง **Docker** และ **Docker Desktop / Compose** เรียบร้อยแล้ว จากนั้นรันคำสั่งเหล่านี้ใน Terminal:

### 1. สั่งรันคอนเทนเนอร์ทั้งหมดใน Background
```bash
docker compose up --build -d
```

### 2. ลิงก์เข้าใช้งานบริการต่างๆ
หลังจากสถานะทุกตารางรันสำเร็จแล้ว คุณสามารถเปิดเว็บเบราว์เซอร์เพื่อใช้งานได้ตามที่อยู่ต่อไปนี้:

- **🖥️ หน้าบ้าน (Frontend Web UI)**: [http://localhost:8001](http://localhost:8001)
- **⚙️ หลังบ้าน (Backend Services API)**: [http://localhost:5000](http://localhost:5000)
- **🗃️ จัดการฐานข้อมูล (phpMyAdmin)**: [http://localhost:8080](http://localhost:8080)
  - **Host**: `db`
  - **Username**: `root`
  - **Password**: `rootpassword`

### 3. สั่งหยุดการทำงาน
เมื่อต้องการหยุดรันระบบ ให้พิมพ์คำสั่ง:
```bash
docker compose down
```

---

## 🛠️ รายละเอียดโครงสร้างการตั้งค่าใน Docker

1. **การเชื่อมต่อระหว่าง Container:** 
   - Backend จะทำการเชื่อมต่อเข้าหา Database โดยใช้ host `db` (ชื่อ Service)
   - หากรัน Docker ขึ้นมาครั้งแรก ระบบหลังบ้านมีโปรโตคอล **Retry Connection 10 ครั้ง** เพื่อรอให้ฐานข้อมูลมารีอาดีบี (MariaDB) บูตเสร็จสิ้นอย่างสมบูรณ์ก่อนที่จะทำการเชื่อมต่อ ทำให้แอปไม่แครช
2. **การคัดกรอกโฟลเดอร์ที่ไม่จำเป็น (Docker Ignore):**
   - มีการแยกสร้าง `.dockerignore` ทั้งที่ Root และ Backend เพื่อละเว้นโมดูล `node_modules` จากเครื่องโลคอลของคุณ ช่วยลดขนาดของ Container Image และเร่งความเร็วในการ build คอนเทนเนอร์
