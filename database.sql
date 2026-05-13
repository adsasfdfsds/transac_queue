-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS queue_system;
USE queue_system;

-- Drop existing tables to reset schema
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS windows;

-- Create windows table
CREATE TABLE windows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    status ENUM('Online', 'Offline') DEFAULT 'Offline',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
);

-- Create tickets table
CREATE TABLE tickets (
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
);

-- Insert default windows
INSERT INTO windows (name, status) VALUES 
('Window 1', 'Offline'),
('Window 2', 'Offline'),
('Window 3', 'Offline');
