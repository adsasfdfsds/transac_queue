# Queue Management System

A real-time queue management system built with Node.js, Express, and MySQL.

## Features

- Real-time ticket queue management
- Multiple service windows
- Window status tracking (Online/Offline)
- Ticket status tracking (Pending, Calling, Served, Cancelled)
- RESTful API
- Responsive web interface

## Prerequisites

- Node.js (v14+)
- MySQL Server (v5.7+)
- npm

## Installation

1. **Clone/Download the project**
   ```bash
   cd queue
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your MySQL credentials:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=queue_system
   PORT=3000
   ```

4. **Create the database**
   
   Option A: Using MySQL CLI
   ```bash
   mysql -u root -p < database.sql
   ```
   
   Option B: Manually in MySQL
   ```sql
   CREATE DATABASE queue_system;
   ```
   The server will create tables automatically on first run.

5. **Start the server**
   ```bash
   node server.js
   ```
   Server will run on `http://localhost:3000`

## API Endpoints

### Get System Status
```
GET /get-system-status
Response: { windowStatuses: {...}, currentCall: {...} }
```

### Add Ticket
```
POST /add-ticket
Body: { queue_num, customer_name, service_type }
```

### Get All Tickets
```
GET /get-tickets
Response: [tickets...]
```

### Update Window Status
```
POST /update-window-status
Body: { window, status }
```

### Call Next Ticket
```
POST /call-next
Body: { queue_num, windowName }
```

### Mark Ticket as Served
```
POST /mark-served
Body: { queue_num }
```

## Project Structure

```
queue/
├── server.js           # Express server with API endpoints
├── index.html          # Main interface
├── admin.html          # Admin interface
├── notifications.html  # Notifications display
├── records.html        # Records/history interface
├── home.css            # Stylesheet
├── script.js           # Frontend JavaScript
├── package.json        # Dependencies
├── .env               # Environment variables (local)
├── .env.example       # Example environment variables
├── database.sql       # Database schema
└── .gitignore         # Git ignore file
```

## Environment Variables

See `.env.example` for all available variables:

- `DB_HOST` - MySQL server hostname
- `DB_USER` - MySQL username
- `DB_PASSWORD` - MySQL password
- `DB_NAME` - Database name
- `PORT` - Server port
- `NODE_ENV` - Environment (development/production)

## Troubleshooting

**Cannot connect to MySQL:**
- Check if MySQL server is running
- Verify credentials in `.env`
- Ensure `queue_system` database exists

**Port already in use:**
- Change `PORT` in `.env` to an available port
- Or kill the process using port 3000

**Tables not created:**
- Server creates tables automatically on startup
- Or manually run: `mysql -u root -p queue_system < database.sql`

## License

MIT
