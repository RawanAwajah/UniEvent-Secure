const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Root123!",
    database: "unievent_secure"
});

connection.connect((err) => {
    if (err) {
        console.error("Connection failed:", err);
    } else {
        console.log("Connected to MySQL");
    }
});

module.exports = connection;