require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS) || 2000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// In-memory storage (fallback when DB unavailable)
let windowStatuses = { "Window 1": "Offline", "Window 2": "Offline", "Window 3": "Offline" };
let tickets = [];
let currentServing = { queue_num: "---", window: "Waiting..." };

// MySQL Connection Pool
let pool = null;
let useDatabase = false;
let isInitializingDatabase = false;

try {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'admin123',
        database: process.env.DB_NAME || 'queue_system',
        connectTimeout: DB_TIMEOUT_MS,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
} catch (err) {
    console.warn('⚠️  Database pool creation warning:', err.message);
}

function withTimeout(promise, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), DB_TIMEOUT_MS);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function getDbConnection() {
    return withTimeout(pool.getConnection(), 'Database connection timed out');
}

async function ensureTicketStudentIdColumn(connection) {
    const [columns] = await connection.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tickets'
          AND COLUMN_NAME IN ('customer_name', 'student_id')
    `);
    const columnNames = columns.map(col => col.COLUMN_NAME);

    if (columnNames.includes('customer_name') && !columnNames.includes('student_id')) {
        await connection.query('ALTER TABLE tickets CHANGE customer_name student_id VARCHAR(100)');
    } else if (!columnNames.includes('student_id')) {
        await connection.query('ALTER TABLE tickets ADD COLUMN student_id VARCHAR(100) AFTER queue_num');
    }
}

// Initialize database tables
async function initializeDatabase() {
    if (isInitializingDatabase) return;
    if (!pool) {
        console.log('📝 Database unavailable - using in-memory storage');
        return;
    }
    
    isInitializingDatabase = true;

    try {
        const connection = await getDbConnection();
        
        // Create windows table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS windows (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                status ENUM('Online', 'Offline') DEFAULT 'Offline',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_status (status)
            )
        `);

        // Create tickets table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                queue_num INT UNIQUE NOT NULL,
                student_id VARCHAR(100),
                service_type VARCHAR(50),
                status ENUM('Pending', 'Calling', 'Served', 'Cancelled') DEFAULT 'Pending',
                window_id INT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (window_id) REFERENCES windows(id),
                INDEX idx_status (status),
                INDEX idx_queue_num (queue_num)
            )
        `);
        await ensureTicketStudentIdColumn(connection);

        // Insert default windows if they don't exist
        await connection.query(`
            INSERT IGNORE INTO windows (name, status) VALUES 
            ('Window 1', 'Offline'),
            ('Window 2', 'Offline'),
            ('Window 3', 'Offline')
        `);

        connection.release();
        useDatabase = true;
        console.log('✅ Database initialized successfully');
    } catch (err) {
        console.warn('⚠️  Database initialization warning:', err.message);
        console.log('📝 Using in-memory storage instead');
        useDatabase = false;
    } finally {
        isInitializingDatabase = false;
    }
}

async function ensureDatabase() {
    if (useDatabase || !pool) return useDatabase;
    await initializeDatabase();
    if (useDatabase) await syncMemoryTicketsToDatabase();
    return useDatabase;
}

async function syncMemoryTicketsToDatabase() {
    if (!tickets.length) return;

    const connection = await getDbConnection();
    try {
        for (const ticket of tickets) {
            await connection.query(
                `INSERT INTO tickets (queue_num, student_id, service_type, status)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id),
                    service_type = VALUES(service_type),
                    status = VALUES(status)`,
                [ticket.queue_num, ticket.student_id, ticket.service_type, ticket.status]
            );
        }
    } finally {
        connection.release();
    }
}

// Initialize on startup
initializeDatabase();

// Get system status
app.get('/get-system-status', async (req, res) => {
    try {
        await ensureDatabase();
        if (useDatabase && pool) {
            const connection = await getDbConnection();
            
            const [windows] = await connection.query('SELECT name, status FROM windows ORDER BY name');
            const [currentTicket] = await connection.query(`
                SELECT t.queue_num, w.name AS window_name
                FROM tickets t 
                LEFT JOIN windows w ON t.window_id = w.id 
                WHERE t.status = 'Calling' 
                ORDER BY t.updated_at DESC LIMIT 1
            `);
            
            connection.release();
            
            const windowStatusesObj = {};
            windows.forEach(w => {
                windowStatusesObj[w.name] = w.status;
            });
            
            const currentServing = currentTicket[0]
                ? { queue_num: currentTicket[0].queue_num, window: currentTicket[0].window_name }
                : { queue_num: '---', window: 'Waiting...' };
            
            return res.json({ windowStatuses: windowStatusesObj, currentCall: currentServing });
        }
        
        // Use in-memory storage
        res.json({ windowStatuses, currentCall: currentServing });
    } catch (err) {
        res.json({ windowStatuses, currentCall: currentServing });
    }
});

// Add new ticket
app.post('/add-ticket', async (req, res) => {
    try {
        const { queue_num, customer_name, student_id, service_type } = req.body;
        const studentId = student_id || customer_name || 'Student';
        await ensureDatabase();
        
        if (useDatabase && pool) {
            const connection = await getDbConnection();

            const [result] = await connection.query(
                `INSERT INTO tickets (queue_num, student_id, service_type, status)
                 VALUES (?, ?, ?, "Pending")
                 ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id),
                    service_type = VALUES(service_type),
                    status = "Pending",
                    window_id = NULL`,
                [queue_num, studentId, service_type]
            );
            
            connection.release();
            
            return res.json({ 
                success: true, 
                ticket: { 
                    id: result.insertId,
                    queue_num, 
                    student_id: studentId,
                    service_type, 
                    status: 'Pending' 
                } 
            });
        }
        
        // Use in-memory storage
        const ticket = { queue_num, student_id: studentId, service_type, status: 'Pending' };
        const ticketIdx = tickets.findIndex(t => Number(t.queue_num) === Number(queue_num));
        if (ticketIdx === -1) {
            tickets.push(ticket);
        } else {
            tickets[ticketIdx] = ticket;
        }
        res.json({ success: true, ticket });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all tickets
app.get('/get-tickets', async (req, res) => {
    try {
        await ensureDatabase();
        if (useDatabase && pool) {
            const connection = await getDbConnection();
            const [result] = await connection.query('SELECT * FROM tickets ORDER BY updated_at DESC');
            connection.release();
            return res.json(result);
        }
        
        // Use in-memory storage
        res.json(tickets);
    } catch (err) {
        console.error('Error fetching tickets:', err.message);
        res.json(tickets);
    }
});

// Update window status
app.post('/update-window-status', async (req, res) => {
    console.log("📍 Received update-window-status request:", req.body);
    try {
        const { window, status } = req.body;
        console.log("Updating window:", window, "to status:", status);
        
        if (!window || !status) {
            console.log("Missing window or status");
            return res.status(400).json({ error: "Missing window or status parameter" });
        }

        await ensureDatabase();
        
        if (useDatabase && pool) {
            try {
                console.log("Attempting database update...");
                const connection = await getDbConnection();
                
                const [result] = await connection.query(
                    'UPDATE windows SET status = ? WHERE name = ?',
                    [status, window]
                );
                
                connection.release();
                
                if (result.affectedRows > 0) {
                    windowStatuses[window] = status;
                    console.log("✅ Database update successful");
                    return res.json({ success: true });
                } else {
                    console.log("❌ Invalid window in database:", window);
                    return res.status(400).json({ error: "Invalid window" });
                }
            } catch (dbErr) {
                console.warn("⚠️  Database error, falling back to in-memory storage:", dbErr.message);
                useDatabase = false;
                // Fall through to in-memory storage
            }
        }
        
        // Use in-memory storage
        console.log("Using in-memory storage. Current windows:", Object.keys(windowStatuses));
        if (windowStatuses.hasOwnProperty(window)) {
            windowStatuses[window] = status;
            console.log("✅ In-memory update successful. New status:", windowStatuses);
            return res.json({ success: true });
        } else {
            console.log("❌ Invalid window in in-memory storage:", window, "Available:", Object.keys(windowStatuses));
            return res.status(400).json({ error: "Invalid window: " + window });
        }
    } catch (err) {
        console.error("❌ Error in update-window-status:", err);
        res.status(500).json({ error: err.message });
    }
});

// Call next ticket
app.post('/call-next', async (req, res) => {
    try {
        const { queue_num, windowName } = req.body;
        await ensureDatabase();
        
        if (useDatabase && pool) {
            const connection = await getDbConnection();
            
            const [windows] = await connection.query('SELECT id FROM windows WHERE name = ?', [windowName]);
            
            if (windows.length === 0) {
                connection.release();
                return res.status(400).json({ error: "Invalid window" });
            }
            
            const windowId = windows[0].id;
            
            await connection.query(
                'UPDATE tickets SET status = "Calling", window_id = ? WHERE queue_num = ?',
                [windowId, queue_num]
            );
            
            const [currentTicket] = await connection.query(`
                SELECT t.queue_num, w.name AS window_name
                FROM tickets t 
                LEFT JOIN windows w ON t.window_id = w.id 
                WHERE t.status = 'Calling' 
                ORDER BY t.updated_at DESC LIMIT 1
            `);
            
            connection.release();
            
            const currentCall = currentTicket[0]
                ? { queue_num: currentTicket[0].queue_num, window: currentTicket[0].window_name }
                : { queue_num, window: windowName };
            console.log(`Now Calling: #${queue_num} at ${windowName}`);
            
            currentServing = currentCall;
            return res.json({ success: true, currentCall });
        }
        
        // Use in-memory storage
        currentServing = { queue_num, window: windowName };
        const ticketIdx = tickets.findIndex(t => t.queue_num === queue_num);
        if (ticketIdx !== -1) {
            tickets[ticketIdx].status = 'Calling';
        }
        console.log(`Now Calling: #${queue_num} at ${windowName}`);
        res.json({ success: true, currentCall: currentServing });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark ticket as served
app.post('/mark-served', async (req, res) => {
    try {
        const { queue_num } = req.body;
        await ensureDatabase();
        
        if (useDatabase && pool) {
            const connection = await getDbConnection();
            
            await connection.query(
                'UPDATE tickets SET status = "Served" WHERE queue_num = ?',
                [queue_num]
            );
            
            connection.release();
            return res.json({ success: true });
        }
        
        // Use in-memory storage
        const ticketIdx = tickets.findIndex(t => t.queue_num === queue_num);
        if (ticketIdx !== -1) {
            tickets[ticketIdx].status = 'Served';
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

// Error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
