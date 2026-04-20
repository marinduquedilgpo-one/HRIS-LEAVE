const http = require("http");
const fs = require("fs");
const path = require("path");
const { database } = require('./firebase-config');
const { sendEmail } = require('./email-config');
const { ref, set, get, child, update, remove, push } = require('firebase/database');
const multer = require('multer');

const port = 3000;

// MIME types for static files
const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + safeFileName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Function to parse JSON body from POST requests
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        console.error('Error parsing JSON:', error.message);
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Initialize default admin and staff accounts
async function initializeDefaultData() {
  try {
    const dbRef = ref(database);
    
    console.log("Checking for existing admin accounts...");
    
    const adminsSnapshot = await get(child(dbRef, 'admins'));
    if (!adminsSnapshot.exists()) {
      console.log("No admins found. Creating default admin accounts...");
      
      const admin1Key = "admin@dilg_gov";
      
      await set(ref(database, `admins/${admin1Key}`), {
        email: "admin@dilg.gov",
        password: "12345",
        name: "System Administrator",
        role: "admin"
      });
      
      console.log("✅ Default admin accounts created");
    } else {
      console.log("✅ Admin accounts already exist");
    }
    
    // Add director account initialization
    console.log("Checking for existing director account...");
    const directorsSnapshot = await get(child(dbRef, 'directors'));
    if (!directorsSnapshot.exists()) {
      console.log("No director found. Creating director account...");
      
      const directorKey = "director@dilg_gov";
      
      await set(ref(database, `directors/${directorKey}`), {
        email: "director@dilg.gov",
        password: "director",
        name: "Director",
        role: "director"
      });
      
      console.log("✅ Director account created with key:", directorKey);
    } else {
      console.log("✅ Director account already exists");
      const directors = directorsSnapshot.val();
      console.log("Existing director keys:", Object.keys(directors));
    }
    
    console.log("Checking for existing staff accounts...");
    
    const staffSnapshot = await get(child(dbRef, 'staff'));
    if (!staffSnapshot.exists()) {
      console.log("No staff found. Creating default staff accounts...");
      
      const defaultStaff = {
        "jane_smith@example_com": {
          name: "Jane Smith",
          fullName: "Jane Smith",
          email: "jane.smith@example.com",
          password: "1234",
          gender: "Female",
          contact: "09123456789",
          position: "Administrative Officer",
          vacationLeave: 15,
          sickLeave: 15,
          vacationUsed: 0,
          sickUsed: 0
        },
        "john_doe@example_com": {
          name: "John Doe",
          fullName: "John Doe",
          email: "john.doe@example.com",
          password: "abcd",
          gender: "Male",
          contact: "09987654321",
          position: "Project Development Officer",
          vacationLeave: 15,
          sickLeave: 15,
          vacationUsed: 0,
          sickUsed: 0
        }
      };
      
      for (const [key, staffData] of Object.entries(defaultStaff)) {
        await set(ref(database, `staff/${key}`), staffData);
        console.log(`  Created staff: ${staffData.name}`);
      }
      
      console.log("✅ Default staff accounts created");
    } else {
      console.log("✅ Staff accounts already exist");
    }
    
  } catch (error) {
    console.log("❌ Error initializing data:", error.message);
  }
}

// Test Firebase connection when server starts
async function testFirebase() {
  try {
    console.log("Testing Firebase connection...");
    
    await set(ref(database, 'server/status'), {
      status: "running",
      lastStarted: new Date().toISOString()
    });
    
    console.log("✅ Firebase connected successfully!");
    
    await initializeDefaultData();
    
  } catch (error) {
    console.log("❌ Firebase connection failed:", error.message);
  }
}

http
  .createServer(async (req, res) => {
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // ===== TEST ENDPOINT =====
    if (req.url === '/api/test' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: "API is working properly" }));
      return;
    }
    
    // ==================== 201 FILES ROUTES ====================
    if (req.url === '/api/201-files/upload' && req.method === 'POST') {
      console.log("📁 Received upload request to /api/201-files/upload");
      upload.single('file')(req, res, async (err) => {
        try {
          if (err) {
            console.error("Multer error:", err);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
          
          const { email, documentName } = req.body;
          const file = req.file;
          
          if (!email) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Email is required' }));
            return;
          }
          
          if (!documentName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Document name is required' }));
            return;
          }
          
          if (!file) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No file uploaded' }));
            return;
          }
          
          const fileData = {
            uploaded: true,
            fileName: file.originalname,
            fileUrl: `/uploads/${file.filename}`,
            uploadedAt: new Date().toISOString(),
            fileSize: file.size
          };
          
          const emailKey = email.replace(/\./g, '_');
          await set(ref(database, `staff201Files/${emailKey}/${documentName}`), fileData);
          
          console.log(`File uploaded successfully for ${email}: ${documentName}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: fileData }));
          
        } catch (error) {
          console.error('Error uploading file:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return;
    }

    if (req.url === '/api/201-files/reupload' && req.method === 'POST') {
      console.log("📁 Received re-upload request to /api/201-files/reupload");
      upload.single('file')(req, res, async (err) => {
        try {
          if (err) {
            console.error("Multer error:", err);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
          
          const { email, documentName } = req.body;
          const file = req.file;
          
          if (!email) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Email is required' }));
            return;
          }
          
          if (!documentName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Document name is required' }));
            return;
          }
          
          if (!file) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No file uploaded' }));
            return;
          }
          
          const emailKey = email.replace(/\./g, '_');
          
          const existingSnapshot = await get(child(ref(database), `staff201Files/${emailKey}/${documentName}`));
          const existingFile = existingSnapshot.val();
          
          if (existingFile && existingFile.fileUrl) {
            const oldFilePath = path.join(__dirname, existingFile.fileUrl);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
              console.log(`Deleted old file: ${oldFilePath}`);
            }
          }
          
          const fileData = {
            uploaded: true,
            fileName: file.originalname,
            fileUrl: `/uploads/${file.filename}`,
            uploadedAt: new Date().toISOString(),
            fileSize: file.size
          };
          
          await set(ref(database, `staff201Files/${emailKey}/${documentName}`), fileData);
          
          console.log(`File re-uploaded successfully for ${email}: ${documentName}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: fileData }));
          
        } catch (error) {
          console.error('Error re-uploading file:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return;
    }
    
    if (req.url.startsWith('/api/201-files/') && req.method === 'GET') {
      try {
        const email = decodeURIComponent(req.url.split('/').pop());
        const emailKey = email.replace(/\./g, '_');
        
        const snapshot = await get(child(ref(database), `staff201Files/${emailKey}`));
        const data = snapshot.val() || {};
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      } catch (error) {
        console.error('Error fetching files:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }
    
    if (req.url.startsWith('/api/201-files/') && req.method === 'DELETE') {
      try {
        const parts = req.url.split('/');
        const email = decodeURIComponent(parts[3]);
        const documentName = decodeURIComponent(parts[4]);
        const emailKey = email.replace(/\./g, '_');
        
        const snapshot = await get(child(ref(database), `staff201Files/${emailKey}/${documentName}`));
        const fileData = snapshot.val();
        
        if (fileData && fileData.fileUrl) {
          const filePath = path.join(__dirname, fileData.fileUrl);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file: ${filePath}`);
          }
        }
        
        await remove(ref(database, `staff201Files/${emailKey}/${documentName}`));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'File deleted successfully' }));
      } catch (error) {
        console.error('Error deleting file:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }
    
    // ==================== SERVE UPLOADED FILES ====================
    if (req.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, req.url);
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end("File not found");
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end(content);
      });
      return;
    }
    
    // ==================== API ROUTES ====================
    if (req.url.startsWith('/api/')) {
      
      // ===== LOGIN API =====
      if (req.url === '/api/login' && req.method === 'POST') {
        try {
          const { email, password } = await getRequestBody(req);
          const emailKey = email.replace(/\./g, '_');
          
          console.log(`Login attempt for: ${email}`);
          console.log(`Looking for key: ${emailKey}`);
          
          // Check for director first
          const directorSnapshot = await get(child(ref(database), `directors/${emailKey}`));
          console.log(`Director exists: ${directorSnapshot.exists()}`);
          
          if (directorSnapshot.exists()) {
            console.log(`Director password in DB: ${directorSnapshot.val().password}`);
            console.log(`Provided password: ${password}`);
            
            if (directorSnapshot.val().password === password) {
              console.log("✅ Director login successful");
              const directorData = directorSnapshot.val();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: true, 
                role: 'director',
                user: directorData
              }));
              return;
            } else {
              console.log("❌ Director password mismatch");
            }
          }
          
          const adminSnapshot = await get(child(ref(database), `admins/${emailKey}`));
          if (adminSnapshot.exists() && adminSnapshot.val().password === password) {
            console.log("✅ Admin login successful");
            const adminData = adminSnapshot.val();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              role: 'admin',
              user: adminData
            }));
            return;
          }
          
          const staffSnapshot = await get(child(ref(database), `staff/${emailKey}`));
          if (staffSnapshot.exists() && staffSnapshot.val().password === password) {
            console.log("✅ Staff login successful");
            const staffData = staffSnapshot.val();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              role: 'staff',
              user: staffData
            }));
            return;
          }
          
          console.log("❌ Login failed: Invalid credentials");
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: "Invalid email or password" }));
          
        } catch (error) {
          console.log("❌ Login error:", error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // ===== STAFF MANAGEMENT APIs =====
      if (req.url === '/api/staff' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'staff'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (snapshot.exists()) {
            const staffData = snapshot.val();
            Object.keys(staffData).forEach(key => {
              delete staffData[key].password;
            });
            res.end(JSON.stringify({ success: true, data: staffData }));
          } else {
            res.end(JSON.stringify({ success: true, data: {} }));
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      if (req.url === '/api/staff' && req.method === 'POST') {
        try {
          const staffData = await getRequestBody(req);
          const emailKey = staffData.email.replace(/\./g, '_');
          
          const vacationLeave = parseFloat(staffData.vacationLeave) || 15;
          const sickLeave = parseFloat(staffData.sickLeave) || 15;
          
          const staffToSave = {
            ...staffData,
            vacationLeave: vacationLeave,
            sickLeave: sickLeave,
            vacationUsed: 0,
            sickUsed: 0,
            createdAt: new Date().toISOString()
          };
          
          await set(ref(database, `staff/${emailKey}`), staffToSave);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: "Staff added successfully",
            key: emailKey 
          }));
        } catch (error) {
          console.error("Error adding staff:", error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      if (req.url.startsWith('/api/staff/') && req.method === 'DELETE') {
        try {
          const email = req.url.split('/').pop();
          const emailKey = email.replace(/\./g, '_');
          await remove(ref(database, `staff/${emailKey}`));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: "Staff deleted successfully" }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      if (req.url === '/api/staff/update' && req.method === 'POST') {
        try {
          const { email, ...updates } = await getRequestBody(req);
          const emailKey = email.replace(/\./g, '_');
          await update(ref(database, `staff/${emailKey}`), updates);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: "Profile updated successfully" }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // ===== LEAVE MANAGEMENT APIs =====
      if (req.url === '/api/leave-requests/admin' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'leaveRequests'));
          const requests = snapshot.val() || {};
          
          const formattedRequests = [];
          for (let id in requests) {
            const request = requests[id];
            formattedRequests.push({
              id: id,
              ...request,
              adminDecision: request.adminDecision || null,
              adminAction: request.adminAction || null,
              processedAt: request.processedAt || null,
              status: request.status || 'Pending'
            });
          }
          
          formattedRequests.sort((a, b) => {
            const dateA = a.createdAt || a.dateFiling;
            const dateB = b.createdAt || b.dateFiling;
            return new Date(dateB) - new Date(dateA);
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: formattedRequests }));
        } catch (error) {
          console.error('Error fetching admin leave requests:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      if (req.url.startsWith('/api/leave-requests/staff/') && req.method === 'GET') {
        try {
          const email = decodeURIComponent(req.url.split('/').pop());
          console.log("📋 Fetching applications for staff email:", email);
          
          const snapshot = await get(child(ref(database), 'leaveRequests'));
          const data = snapshot.val() || {};
          
          const staffApps = Object.entries(data)
            .filter(([_, item]) => item.staffEmail === email || item.email === email)
            .map(([id, item]) => ({ 
              id, 
              ...item,
              adminDecision: item.adminDecision || null,
              adminAction: item.adminAction || null,
              processedAt: item.processedAt || null
            }))
            .sort((a, b) => new Date(b.createdAt || b.applied) - new Date(a.createdAt || a.applied));
          
          console.log(`📋 Found ${staffApps.length} applications for staff`);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: staffApps }));
          return;
        } catch (error) {
          console.error('❌ Error fetching staff applications:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
          return;
        }
      }
      
      // Get single leave request by ID
      if (req.url.match(/^\/api\/leave-requests\/[^\/]+$/) && req.method === 'GET') {
        try {
          const leaveId = req.url.split('/').pop();
          
          if (leaveId === 'admin' || leaveId === 'staff' || leaveId === 'pending' || leaveId === 'count') {
            return;
          }
          
          const snapshot = await get(child(ref(database), `leaveRequests/${leaveId}`));
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: data }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: "Leave request not found" }));
          }
          return;
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
          return;
        }
      }
      
      // Submit leave request
      if (req.url === '/api/leave-requests' && req.method === 'POST') {
        try {
          const leaveData = await getRequestBody(req);
          console.log("📝 STEP 1: Received leave data:", leaveData);
          
          const newLeaveRef = push(ref(database, 'leaveRequests'));
          console.log("📝 STEP 2: Created new reference with ID:", newLeaveRef.key);
          
          const leaveToSave = {
            ...leaveData,
            id: newLeaveRef.key,
            applied: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            status: 'Pending',
            adminRead: false
          };
          
          console.log("📝 STEP 3: Data to save:", leaveToSave);
          
          await set(newLeaveRef, leaveToSave);
          console.log("✅ STEP 4: Successfully saved to database!");
          
          // Send email notifications
          try {
            const staffEmail = leaveData.staffEmail || leaveData.email;
            const staffName = leaveData.staffName || leaveData.firstName + ' ' + leaveData.lastName;
            
            const staffHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #00081e; border-radius: 10px; padding: 20px;">
                <div style="text-align: center; background: #00081e; color: #cdae00; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                  <h2 style="margin: 0;">CIVIL SERVICE FORM NO. 6</h2>
                  <h3 style="margin: 5px 0 0 0;">APPLICATION FOR LEAVE</h3>
                </div>
                
                <h3 style="color: #00081e;">Leave Application Received</h3>
                <p>Dear <strong>${staffName}</strong>,</p>
                <p>Your leave application has been received and is now <strong style="color: #cdae00;">pending approval</strong>.</p>
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <h4 style="color: #00081e; margin-top: 0;">Application Details:</h4>
                  <p><strong>Leave Type:</strong> ${leaveData.leaveType}</p>
                  <p><strong>Date Filed:</strong> ${leaveData.dateFiling}</p>
                  <p><strong>Duration:</strong> ${leaveData.workingDays} days (${leaveData.fromDate} to ${leaveData.toDate})</p>
                </div>
                
                <p style="color: #666;">You will receive another email once your application is reviewed.</p>
                
                <div style="margin-top: 30px; text-align: center; color: #666;">
                  <p>DILG Leave Management System</p>
                </div>
              </div>
            `;
            
            await sendEmail(staffEmail, '📝 Leave Application Received', staffHtml);
            console.log("✅ STEP 5: Email sent to staff");
            
            // Send to admins
            const adminsSnapshot = await get(child(ref(database), 'admins'));
            if (adminsSnapshot.exists()) {
              const admins = adminsSnapshot.val();
              
              const adminHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #00081e; border-radius: 10px; padding: 20px;">
                  <div style="text-align: center; background: #00081e; color: #cdae00; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                    <h2>NEW LEAVE APPLICATION</h2>
                  </div>
                  
                  <p>A new leave application has been submitted by <strong>${staffName}</strong>.</p>
                  
                  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h4 style="color: #00081e; margin-top: 0;">Application Details:</h4>
                    <p><strong>Employee:</strong> ${staffName}</p>
                    <p><strong>Email:</strong> ${staffEmail}</p>
                    <p><strong>Leave Type:</strong> ${leaveData.leaveType}</p>
                    <p><strong>Duration:</strong> ${leaveData.workingDays} days</p>
                  </div>
                  
                  <div style="text-align: center;">
                    <a href="http://localhost:${port}/admin-leave-review.html?id=${newLeaveRef.key}" style="background-color: #00081e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">▶ REVIEW APPLICATION</a>
                  </div>
                </div>
              `;
              
              for (const [key, admin] of Object.entries(admins)) {
                if (admin.email) {
                  await sendEmail(admin.email, '🔔 New Leave Application Submitted', adminHtml);
                }
              }
              console.log("✅ STEP 6: Emails sent to admins");
            }
          } catch (emailError) {
            console.log("⚠️ Email sending failed:", emailError.message);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: "Leave request submitted successfully",
            id: newLeaveRef.key 
          }));
          
        } catch (error) {
          console.error('❌ Error submitting leave:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // ==================== SIGNATURE SAVING ENDPOINT ====================
      // Add this endpoint to handle signature saving
      if (req.url === '/api/leave-requests/signatures' && req.method === 'POST') {
        try {
          const { leaveId, signatures } = await getRequestBody(req);
          
          if (!leaveId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: "Leave ID is required" }));
            return;
          }
          
          // Update only the signatures field in the leave request
          await update(ref(database, `leaveRequests/${leaveId}`), {
            signatures: signatures,
            signaturesUpdatedAt: new Date().toISOString()
          });
          
          console.log(`✅ Signatures saved for leave ${leaveId}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: "Signatures saved successfully" }));
          
        } catch (error) {
          console.error('Error saving signatures:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // ==================== LEAVE STATUS UPDATE WITH DEDUCTION LOGIC ====================
      if (req.url === '/api/leave-requests/status' && req.method === 'POST') {
        try {
          const requestBody = await getRequestBody(req);
          console.log("🔍 FULL REQUEST BODY RECEIVED:", JSON.stringify(requestBody, null, 2));
          
          const { 
            leaveId, 
            status, 
            actionDetails, 
            signatures, 
            adminDecision,
            directorFinalDecision,
            directorName,
            workingDays,
            leaveType,
            staffEmail,
            staffName
          } = requestBody;
          
          console.log("📝 Processing leave status update:", { 
            leaveId, 
            status, 
            directorFinalDecision,
            directorFinalDecisionType: typeof directorFinalDecision
          });
          console.log("📊 Leave details for deduction:", { leaveType, workingDays, staffEmail });
          
          // Get the leave request
          const leaveSnapshot = await get(child(ref(database), `leaveRequests/${leaveId}`));
          const leaveData = leaveSnapshot.val();
          
          if (!leaveData) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: "Leave request not found" }));
            return;
          }
          
          // Use provided values or fallback to leaveData
          const finalLeaveType = leaveType || leaveData.leaveType;
          const finalWorkingDays = parseFloat(workingDays || leaveData.workingDays) || 0;
          const finalStaffEmail = staffEmail || leaveData.staffEmail || leaveData.email;
          const finalStaffName = staffName || leaveData.staffName || leaveData.firstName + ' ' + leaveData.lastName;
          
          // CHECK IF THIS IS DIRECTOR FINAL APPROVAL
          let isDirectorFinalApproval = false;

          console.log("🔍 directorFinalDecision received:", directorFinalDecision);
          console.log("🔍 status received:", status);

          // Simple check - if directorFinalDecision is exactly 'approved'
          if (directorFinalDecision === 'approved') {
            isDirectorFinalApproval = true;
            console.log("✅ DIRECTOR FINAL APPROVAL - WILL DEDUCT CREDITS");
          } else {
            console.log("❌ NOT DIRECTOR FINAL APPROVAL - No deduction");
          }

          // Also check if status is 'Approved' and we're in director mode
          if (status === 'Approved' && !isDirectorFinalApproval) {
            console.log("⚠️ Status is Approved but directorFinalDecision is not 'approved'");
          }
          
          console.log(`🎯 Is Director Final Approval: ${isDirectorFinalApproval}`);
          console.log(`🎯 Status: ${status}`);
          
          let deductionResult = null;
          let staffKey = null;
          let staffRecord = null;
          
          // Get staff reference
          if (finalStaffEmail) {
            const staffRef = ref(database, 'staff');
            const snapshot = await get(staffRef);
            const staffData = snapshot.val();
            
            console.log("🔍 Looking for staff with email:", finalStaffEmail);
            
            if (staffData) {
              const emailKey = finalStaffEmail.replace(/\./g, '_');
              if (staffData[emailKey]) {
                staffKey = emailKey;
                staffRecord = staffData[emailKey];
                console.log(`✅ Found staff record by email key: ${emailKey}`);
              } else {
                for (const [key, value] of Object.entries(staffData)) {
                  if (value.email === finalStaffEmail || 
                      (value.fullName && value.fullName === finalStaffName) ||
                      (value.name && value.name === finalStaffName)) {
                    staffKey = key;
                    staffRecord = value;
                    console.log(`✅ Found staff record by name: ${finalStaffName}, key: ${key}`);
                    break;
                  }
                }
              }
            }
          }
          
          if (staffRecord) {
            console.log("📊 Staff record found:", {
              name: staffRecord.fullName || staffRecord.name,
              vacationLeave: staffRecord.vacationLeave,
              sickLeave: staffRecord.sickLeave,
              vacationUsed: staffRecord.vacationUsed,
              sickUsed: staffRecord.sickUsed
            });
          } else {
            console.log("⚠️ No staff record found!");
          }
          
          // PERFORM DEDUCTION ONLY FOR DIRECTOR FINAL APPROVAL
          // Also check if status is 'Approved' (director final approval)
          if ((status === 'Approved' || isDirectorFinalApproval) && staffRecord) {
            console.log("🎯 FORCE DEDUCTION - Status is Approved, deducting credits");
            
            let updatedVacationLeave = parseFloat(staffRecord.vacationLeave) || 0;
            let updatedSickLeave = parseFloat(staffRecord.sickLeave) || 0;
            let updatedVacationUsed = parseFloat(staffRecord.vacationUsed) || 0;
            let updatedSickUsed = parseFloat(staffRecord.sickUsed) || 0;
            const daysToDeduct = finalWorkingDays;
            
            console.log(`📊 Current balances before deduction:`);
            console.log(`   Vacation: ${updatedVacationLeave} (remaining), ${updatedVacationUsed} (used)`);
            console.log(`   Sick: ${updatedSickLeave} (remaining), ${updatedSickUsed} (used)`);
            console.log(`   Days to deduct: ${daysToDeduct}`);
            console.log(`   Leave type: ${finalLeaveType}`);
            
            const leaveTypeLower = (finalLeaveType || '').toLowerCase();
            
            if (leaveTypeLower.includes('vacation')) {
              if (updatedVacationLeave < daysToDeduct) {
                console.log(`❌ Insufficient vacation balance: ${updatedVacationLeave} < ${daysToDeduct}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  success: false, 
                  error: `Insufficient vacation leave balance. Available: ${updatedVacationLeave.toFixed(3)}, Requested: ${daysToDeduct}` 
                }));
                return;
              }
              updatedVacationLeave -= daysToDeduct;
              updatedVacationUsed += daysToDeduct;
              deductionResult = {
                deducted: true,
                leaveType: 'Vacation',
                daysDeducted: daysToDeduct,
                newVacationBalance: updatedVacationLeave,
                newVacationUsed: updatedVacationUsed,
                oldVacationBalance: parseFloat(staffRecord.vacationLeave) || 0
              };
              console.log(`✅ Deducted ${daysToDeduct} days from Vacation Leave. New balance: ${updatedVacationLeave}`);
              
            } else if (leaveTypeLower.includes('sick')) {
              if (updatedSickLeave < daysToDeduct) {
                console.log(`❌ Insufficient sick balance: ${updatedSickLeave} < ${daysToDeduct}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  success: false, 
                  error: `Insufficient sick leave balance. Available: ${updatedSickLeave.toFixed(3)}, Requested: ${daysToDeduct}` 
                }));
                return;
              }
              updatedSickLeave -= daysToDeduct;
              updatedSickUsed += daysToDeduct;
              deductionResult = {
                deducted: true,
                leaveType: 'Sick',
                daysDeducted: daysToDeduct,
                newSickBalance: updatedSickLeave,
                newSickUsed: updatedSickUsed,
                oldSickBalance: parseFloat(staffRecord.sickLeave) || 0
              };
              console.log(`✅ Deducted ${daysToDeduct} days from Sick Leave. New balance: ${updatedSickLeave}`);
              
            } else {
              console.log(`⚠️ Unknown leave type: ${finalLeaveType} - No deduction performed`);
              deductionResult = {
                deducted: false,
                message: `Unknown leave type: ${finalLeaveType} - No deduction performed`
              };
            }
            
                        // Update staff record if deduction was performed
            if (deductionResult && deductionResult.deducted && staffKey) {
              console.log("🔴🔴🔴 ATTEMPTING TO UPDATE DATABASE 🔴🔴🔴");
              console.log("Staff Key:", staffKey);
              console.log("Database path:", `staff/${staffKey}`);
              
              const staffUpdates = {
                vacationLeave: updatedVacationLeave,
                sickLeave: updatedSickLeave,
                vacationUsed: updatedVacationUsed,
                sickUsed: updatedSickUsed,
                lastLeaveDeduction: new Date().toISOString(),
                lastDeductionLeaveId: leaveId,
                lastDeductionDays: daysToDeduct,
                lastDeductionType: deductionResult.leaveType
              };
              
              console.log("📝 Updating staff record with:", staffUpdates);
              
              // DIRECT UPDATE - use set instead of update to ensure it works
              try {
                await set(ref(database, `staff/${staffKey}`), {
                  ...staffRecord,
                  ...staffUpdates
                });
                console.log(`✅ Staff record UPDATED for ${finalStaffName}`);
                
                // Verify the update by reading back
                const verifySnapshot = await get(child(ref(database), `staff/${staffKey}`));
                const verifiedStaff = verifySnapshot.val();
                console.log("🔍 VERIFICATION - New staff record:", {
                  vacationLeave: verifiedStaff.vacationLeave,
                  sickLeave: verifiedStaff.sickLeave,
                  vacationUsed: verifiedStaff.vacationUsed,
                  sickUsed: verifiedStaff.sickUsed
                });
                
                if (verifiedStaff.vacationLeave === updatedVacationLeave && verifiedStaff.sickLeave === updatedSickLeave) {
                  console.log("✅✅✅ DATABASE UPDATE VERIFIED SUCCESSFULLY! ✅✅✅");
                } else {
                  console.log("❌❌❌ DATABASE UPDATE FAILED - Values don't match! ❌❌❌");
                }
              } catch (updateError) {
                console.error("❌ ERROR UPDATING DATABASE:", updateError);
              }
            }
            
          } else if (status === 'Rejected') {
            console.log(`❌ Leave REJECTED - No deduction for ${finalStaffName}`);
            deductionResult = {
              deducted: false,
              message: 'Leave rejected - no credits deducted'
            };
          } else if (!isDirectorFinalApproval && status === 'Pending Director Approval') {
            console.log(`📤 Leave submitted for Director approval - No deduction yet`);
            deductionResult = {
              deducted: false,
              message: 'Pending director approval - no credits deducted yet'
            };
          } else {
            console.log(`ℹ️ No deduction performed for status: ${status}`);
            deductionResult = {
              deducted: false,
              message: `No deduction for status: ${status}`
            };
          }
          
          console.log("📊 Final deductionResult:", deductionResult);
          
          // Prepare admin decision
          const sourceData = actionDetails || adminDecision || {};
          
          const completeAdminDecision = {
            recommendation: sourceData.recommendation || '',
            disapprovalReason: sourceData.disapprovalReason || '',
            daysWithPay: sourceData.daysWithPay || '',
            daysWithoutPay: sourceData.daysWithoutPay || '',
            others: sourceData.others || '',
            withPayChecked: sourceData.withPayChecked || sourceData.daysWithPay !== '',
            withoutPayChecked: sourceData.withoutPayChecked || sourceData.daysWithoutPay !== '',
            othersChecked: sourceData.othersChecked || sourceData.others !== '',
            disapprovedReason: sourceData.disapprovedReason || '',
            oicName: sourceData.oicName || 'JOHN ERICK J. MATINING',
            oicPosition: sourceData.oicPosition || 'Program Manager',
            pdName: sourceData.pdName || 'IVAN STEPHEN F. FADRI, CESE',
            asOfDate: sourceData.asOfDate || new Date().toLocaleDateString(),
            totalVacation: sourceData.totalVacation || '0',
            totalSick: sourceData.totalSick || '0',
            lessVacation: sourceData.lessVacation || '0',
            lessSick: sourceData.lessSick || '0',
            balanceVacation: sourceData.balanceVacation || '0',
            balanceSick: sourceData.balanceSick || '0',
            processedBy: isDirectorFinalApproval ? 'Director' : 'Admin',
            processedDate: new Date().toISOString(),
            status: status,
            deductionPerformed: deductionResult ? deductionResult.deducted : false,
            deductionDetails: deductionResult || null
          };
          
          // Update leave request
          const updateData = {
            status: status,
            adminAction: sourceData,
            adminDecision: completeAdminDecision,
            signatures: signatures,
            processedAt: new Date().toISOString(),
            processedBy: isDirectorFinalApproval ? 'Director' : 'Admin',
            directorFinalDecision: isDirectorFinalApproval ? 'approved' : (status === 'Rejected' ? 'rejected' : null),
            directorName: directorName || null,
            deductionPerformed: deductionResult ? deductionResult.deducted : false,
            deductionDetails: deductionResult || null
          };
          
          Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined || updateData[key] === null) {
              delete updateData[key];
            }
          });
          
          await update(ref(database, `leaveRequests/${leaveId}`), updateData);
          console.log("✅ Leave request updated");
          
          // Save to history
          const historyRecord = {
            historyId: Date.now().toString(),
            leaveId: leaveId,
            processedDate: new Date().toISOString(),
            processedBy: isDirectorFinalApproval ? 'Director' : 'Admin',
            status: status,
            directorName: directorName || null,
            directorFinalDecision: isDirectorFinalApproval ? 'approved' : (status === 'Rejected' ? 'rejected' : null),
            ...leaveData,
            adminDecision: completeAdminDecision,
            adminAction: sourceData,
            signatures: signatures,
            deductionInfo: deductionResult
          };
          
          const historyRef = push(ref(database, 'leaveHistory'));
          await set(historyRef, historyRecord);
          console.log("✅ History saved");
          
          // Send email notification
          try {
            if (finalStaffEmail) {
              let emailHtml = '';
              let emailSubject = '';
              
              if (isDirectorFinalApproval && deductionResult && deductionResult.deducted) {
                emailSubject = `✅ Leave Application APPROVED - Credits Deducted`;
                emailHtml = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #28a745; border-radius: 10px; padding: 20px;">
                    <div style="text-align: center; background: #28a745; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                      <h2>✅ LEAVE APPLICATION APPROVED</h2>
                    </div>
                    <p>Dear <strong>${finalStaffName}</strong>,</p>
                    <p>Your leave application has been <strong>FULLY APPROVED</strong> by the Director.</p>
                    <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                      <h3>📉 LEAVE CREDITS DEDUCTED:</h3>
                      <p><strong>${deductionResult.leaveType} Leave:</strong> -${deductionResult.daysDeducted} days</p>
                      ${deductionResult.newVacationBalance !== undefined ? `<p><strong>New Vacation Balance:</strong> ${deductionResult.newVacationBalance.toFixed(3)} days</p>` : ''}
                      ${deductionResult.newSickBalance !== undefined ? `<p><strong>New Sick Balance:</strong> ${deductionResult.newSickBalance.toFixed(3)} days</p>` : ''}
                    </div>
                    <p>Thank you,<br><strong>DILG Leave System</strong></p>
                  </div>
                `;
              } else if (status === 'Rejected') {
                emailSubject = `❌ Leave Application REJECTED`;
                emailHtml = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #dc3545; border-radius: 10px; padding: 20px;">
                    <div style="text-align: center; background: #dc3545; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                      <h2>❌ LEAVE APPLICATION REJECTED</h2>
                    </div>
                    <p>Dear <strong>${finalStaffName}</strong>,</p>
                    <p>Your leave application has been <strong>REJECTED</strong>. No leave credits were deducted.</p>
                    <p>Thank you,<br><strong>DILG Leave System</strong></p>
                  </div>
                `;
              } else {
                emailSubject = `📤 Leave Application Submitted for Director Review`;
                emailHtml = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #cdae00; border-radius: 10px; padding: 20px;">
                    <div style="text-align: center; background: #cdae00; color: #00081e; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                      <h2>📤 LEAVE APPLICATION SUBMITTED</h2>
                    </div>
                    <p>Dear <strong>${finalStaffName}</strong>,</p>
                    <p>Your leave application has been reviewed and is now pending the Director's final approval.</p>
                    <p>Thank you,<br><strong>DILG Leave System</strong></p>
                  </div>
                `;
              }
              
              await sendEmail(finalStaffEmail, emailSubject, emailHtml);
              console.log(`✅ Email sent to staff: ${finalStaffEmail}`);
            }
          } catch (emailError) {
            console.log("⚠️ Email sending failed:", emailError.message);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: isDirectorFinalApproval && deductionResult?.deducted ? 'Leave approved and credits deducted successfully' : `Leave ${status} successfully`,
            status: status,
            deductions: deductionResult
          }));
          
        } catch (error) {
          console.error('Error processing leave:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // Save admin draft
      if (req.url === '/api/leave-requests/draft' && req.method === 'POST') {
        try {
          const { leaveId, adminData, signatures, status } = await getRequestBody(req);
          
          await update(ref(database, `leaveRequests/${leaveId}`), {
            adminDraft: adminData,
            adminAction: adminData,
            signatures: signatures,
            status: status || 'Draft',
            lastModified: new Date().toISOString()
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: "Draft saved successfully" }));
        } catch (error) {
          console.error('Error saving draft:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // Get pending applications count
      if (req.url === '/api/leave-requests/pending/count' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'leaveRequests'));
          const data = snapshot.val() || {};
          
          const pendingCount = Object.values(data)
            .filter(item => (item.status || 'Pending') === 'Pending')
            .length;
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: pendingCount }));
          return;
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
          return;
        }
      }
      
      // Get pending applications list
      if (req.url === '/api/leave-requests/pending' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'leaveRequests'));
          const data = snapshot.val() || {};
          
          const pending = Object.entries(data)
            .filter(([_, item]) => (item.status || 'Pending') === 'Pending')
            .map(([id, item]) => ({ id, ...item }))
            .sort((a, b) => new Date(b.createdAt || b.applied) - new Date(a.createdAt || a.applied));
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: pending }));
          return;
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
          return;
        }
      }
      
      // Get leave credits
      if (req.url === '/api/leave-credits' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'staff'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            const creditsList = Object.values(data).map(staff => ({
              name: staff.fullName || staff.name,
              vacation: staff.vacationLeave || 0,
              sick: staff.sickLeave || 0,
              vacationUsed: staff.vacationUsed || 0,
              sickUsed: staff.sickUsed || 0
            }));
            res.end(JSON.stringify({ success: true, data: creditsList }));
          } else {
            res.end(JSON.stringify({ success: true, data: [] }));
          }
        } catch (error) {
          console.error("Error fetching leave credits:", error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // Update leave credits
      if (req.url === '/api/leave-credits/update' && req.method === 'POST') {
        try {
          const { name, vacation, sick, vacationUsed, sickUsed } = await getRequestBody(req);
          
          const staffRef = ref(database, 'staff');
          const snapshot = await get(staffRef);
          const allStaff = snapshot.val();
          
          let staffKey = null;
          Object.keys(allStaff).forEach(key => {
            if (allStaff[key].fullName === name || allStaff[key].name === name) {
              staffKey = key;
            }
          });
          
          if (staffKey) {
            const updates = {
              vacationLeave: vacation,
              sickLeave: sick
            };
            if (vacationUsed !== undefined) updates.vacationUsed = vacationUsed;
            if (sickUsed !== undefined) updates.sickUsed = sickUsed;
            
            await update(ref(database, `staff/${staffKey}`), updates);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: "Credits updated successfully" }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: "Staff member not found" }));
          }
        } catch (error) {
          console.error("Error updating credits:", error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }

      // Get all admins
      if (req.url === '/api/admins' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'admins'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (snapshot.exists()) {
            const adminsData = snapshot.val();
            Object.keys(adminsData).forEach(key => {
              delete adminsData[key].password;
            });
            res.end(JSON.stringify({ success: true, data: adminsData }));
          } else {
            res.end(JSON.stringify({ success: true, data: {} }));
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // Get leave history
      if (req.url === '/api/leave-history' && req.method === 'GET') {
        try {
          const snapshot = await get(child(ref(database), 'leaveHistory'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (snapshot.exists()) {
            res.end(JSON.stringify({ success: true, data: snapshot.val() }));
          } else {
            res.end(JSON.stringify({ success: true, data: {} }));
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      
      // Mark application as read
      if (req.url.match(/\/api\/leave-requests\/[^/]+\/read$/) && req.method === 'POST') {
        try {
          const leaveId = req.url.split('/')[3];
          await update(ref(database, `leaveRequests/${leaveId}`), { 
            adminRead: true,
            readAt: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
          return;
        }
      }
      
      // If API route not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: "API endpoint not found" }));
      return;
    }
    
    // ==================== STATIC FILES ====================
    let requestPath = req.url.split('?')[0];
    if (requestPath === "/") {
      requestPath = "/login.html";
    }
    
    let filePath = path.join(__dirname, "public", requestPath);
    let ext = path.extname(filePath);
    let contentType = mimeTypes[ext] || "text/plain";
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        console.log("MISSING:", filePath);
        res.writeHead(404);
        res.end("File Not Found");
        return;
      }
      
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    });
  })
  .listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    testFirebase();
  });