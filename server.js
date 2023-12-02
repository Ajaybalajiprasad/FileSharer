const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Set up the SQLite database
const db = new sqlite3.Database('NewfileMappings.db', (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
    console.log('Connected to the SQLite database.');
    // Create a new table with the pin column
    db.run(`CREATE TABLE IF NOT EXISTS file_mapping (
        uuid TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        pin TEXT UNIQUE NOT NULL
    )`, (err) => {
        if (err) {
            console.error(err.message);
            throw err;
        }
    });
});

// Function to generate a unique pin
function generatePin() {
    return Math.floor(100 + Math.random() * 900).toString();
}

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = uuidv4();
        const uniqueFilename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
        cb(null, uniqueFilename);
    }
});

const upload = multer({ storage: storage });

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const uniqueId = uuidv4();
    const uniqueFilename = req.file.filename;
    const pin = generatePin(); // Generate a unique pin
    // Store the mapping (UUID => filename) and pin in the SQLite database
    db.run('INSERT INTO file_mapping (uuid, filename, pin) VALUES (?, ?, ?)', [uniqueId, uniqueFilename, pin], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error occurred.' });
        }
        // Send the pin back to the client
        res.json({ success: true, pin: pin });
    });
});

// Function to retrieve the file path using the pin
function getFilePathFromPin(pin, callback) {
    db.get('SELECT filename FROM file_mapping WHERE pin = ?', [pin], function(err, row) {
        if (err) {
            callback(err);
        } else if (row) {
            callback(null, path.join(__dirname, 'uploads', row.filename));
        } else {
            callback(new Error('Pin not found.'));
        }
    });
}

// Endpoint to download a file using a pin
app.get('/download/:pin', (req, res) => {
    const pin = req.params.pin;
    getFilePathFromPin(pin, function(err, filePath) {
        if (err) {
            if (err.message === 'Pin not found.') {
                res.status(404).json({ success: false, message: 'Pin not found.' });
            } else {
                res.status(500).json({ success: false, message: 'An error occurred while retrieving the file.' });
                console.error(err.message);
            }
        } else {
            res.download(filePath, (err) => {
                if (err) {
                    res.status(500).json({ success: false, message: 'An error occurred while downloading the file.' });
                    console.error(err.message);
                }
            });
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
