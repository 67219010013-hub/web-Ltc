FROM node:20-alpine

WORKDIR /app

# คัดลอก package.json และ package-lock.json เพื่อติดตั้ง dependencies
COPY package*.json ./

RUN npm install

# คัดลอกโค้ดทั้งหมดของ backend
COPY . .

EXPOSE 5000

CMD ["node", "hospital-backend.js"]
