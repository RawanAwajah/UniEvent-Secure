require('dotenv').config();
function isAdmin(req, res, next) {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    if (req.session.role !== "admin") {
        return res.send("Access Denied");
    }

    next();
}
const session = require("express-session");
const express = require("express");
const bcrypt = require("bcrypt");
const db = require("./config/db");
const helmet = require("helmet");
const { body, validationResult } = require("express-validator");


const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
    session({
        secret: "unievent-secret-key",
        resave: false,
        saveUninitialized: false
    })
);
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);
app.use(express.static("public"));

// View Engine
app.set("view engine", "ejs");

// =========================
// Home Page
// =========================
app.get("/", (req, res) => {

    const sql = `
        SELECT *
        FROM events
        ORDER BY date ASC
        LIMIT 6
    `;

    db.query(sql, (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        res.render("homepage", {
            events: results
        });

    });
    

});

// =========================
// Register Page
// =========================
app.get("/register", (req, res) => {
res.render("register");
});
app.get("/events/create", isAdmin , (req, res) => {
    res.render("create-event");
});

// =========================
// Register User
// =========================
app.post(
    "/register",
    [
        body("name").notEmpty().withMessage("Name is required"),
        body("email").isEmail().withMessage("Invalid email"),
        body("password")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters")
    ],
    async (req, res) => {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.send(errors.array()[0].msg);
        }

        const { name, email, password } = req.body;

        try {

            const hashedPassword =
                await bcrypt.hash(password, 10);

            const sql =
                "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

            db.query(
                sql,
                [name, email, hashedPassword],
                (err, result) => {

                    if (err) {
                        console.error(err);
                        return res.send("Registration Failed");
                    }

                    req.session.message =
                     "Account created successfully. Please login.";

                    res.redirect("/login");

                }
            );

        } catch (error) {

            console.error(error);
            res.send("Something went wrong");

        }

    }
);
// =========================
// Login Page
// =========================
app.get("/login", (req, res) => {
    res.render("login");
    
});

// =========================
// Login User
// =========================
app.post("/login", (req, res) => {

    const { email, password } = req.body;

    const sql =
        "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            return res.send("User Not Found");
        }

        const user = results[0];

        const match = await bcrypt.compare(
            password,
            user.password
        );

       if (!match) {
    return res.send("Incorrect Password");
}

req.session.userId = user.id;
req.session.userName = user.name;
req.session.role = user.role;

if (user.role === "admin") {
    return res.redirect("/admin");
}

return res.redirect("/dashboard");

    });   // closes db.query

}); 

// =========================
// Dashboard
// =========================
app.get("/dashboard", (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const userId = req.session.userId;

    db.query(
        "SELECT COUNT(*) AS totalBookings FROM bookings WHERE user_id = ?",
        [userId],
        (err, bookingsResult) => {

            db.query(
                "SELECT COUNT(*) AS totalEvents FROM events",
                (err, eventsResult) => {

                    db.query(
                        "SELECT COUNT(*) AS cancelledBookings FROM bookings WHERE user_id = ? AND status='cancelled'",
                        [userId],
                        (err, cancelledResult) => {

                            db.query(
                                "SELECT * FROM events ORDER BY date ASC LIMIT 5",
                                (err, events) => {

                                    res.render("dashboard", {
                                        userName: req.session.userName,
                                        totalBookings: bookingsResult[0].totalBookings,
                                        totalEvents: eventsResult[0].totalEvents,
                                        cancelledBookings: cancelledResult[0].cancelledBookings,
                                        events
                                    });

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});
app.post("/events/create",isAdmin, (req, res) => {

    const {
        title,
        description,
        location,
        category,
        date,
        capacity
    } = req.body;

    const sql = `
        INSERT INTO events
        (title, description, location, category, date, capacity)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [title, description, location, category, date, capacity],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Failed to Create Event");
            }

           req.session.message = "Event Created Successfully";
           return res.redirect("/events");
        }
    );

});
app.get("/events", (req, res) => {

    const sql = "SELECT * FROM events";

    db.query(sql, (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

     const message = req.session.message || null;

console.log("SESSION MESSAGE:", message);

req.session.message = null;

res.render("events", {
    events: results,
    message: message
});

    });

});
app.post("/book-event", (req, res) => {

    const event_id = req.body.event_id;
    const user_id = req.session.userId;

    const checkSql = `
SELECT *
FROM bookings
WHERE user_id = ?
AND event_id = ?
`;

    db.query(
        checkSql,
        [user_id, event_id],
        (err, results) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            if (results.length > 0) {
                req.session.message ="You have already booked this event";

                return res.redirect("/events");
            }

            const insertSql = `
                INSERT INTO bookings
                (user_id, event_id)
                VALUES (?, ?)
            `;

            db.query(
                insertSql,
                [user_id, event_id],
                (err, result) => {

                    if (err) {
                        console.error(err);
                        return res.send("Booking Failed");
                    }

                    req.session.message = "Event booked successfully!";
                    return res.redirect("/events");

                }
            );

        }
    );

});
app.get("/my-bookings", (req, res) => {

    const user_id = req.session.userId;

if (!user_id) {
    return res.redirect("/login");
} 

    const sql = `
        SELECT
            bookings.id,
            events.title,
            events.location,
            events.date,
            bookings.booking_date,
            bookings.status
        FROM bookings
        JOIN events
        ON bookings.event_id = events.id
        WHERE bookings.user_id = ?
    `;

    db.query(sql, [user_id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        res.render("my-bookings", {
            bookings: results
        });

    });

});
app.post("/cancel-booking", (req, res) => {

    const booking_id = req.body.booking_id;

    const sql = `
        UPDATE bookings
        SET status = 'cancelled'
        WHERE id = ?
    `;

    db.query(sql, [booking_id], (err, result) => {

        if (err) {
            console.error(err);
            return res.send("Cancellation Failed");
        }

        res.redirect("/my-bookings");

    });

});
app.get("/admin",  (req, res) => {
    res.render("admin");
});
app.get("/admin/events", (req, res) => {

    db.query(
        "SELECT * FROM events",
        (err, results) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            res.render(
                "admin-events",
                { events: results }
            );

        }
    );

});

app.post("/admin/delete-event",  isAdmin,(req, res) => {

const id = req.body.id;

// Delete bookings related to the event first
db.query(
    "DELETE FROM bookings WHERE event_id = ?",
    [id],
    (err) => {

        if (err) {
            console.error(err);
            return res.send("Failed to delete bookings");
        }

        // Then delete the event
        db.query(
            "DELETE FROM events WHERE id = ?",
            [id],
            (err) => {

                if (err) {
                    console.error(err);
                    return res.send("Failed to delete event");
                }

                res.redirect("/admin/events");

            }
        );

    }
);

});
app.get("/admin/bookings", isAdmin, (req, res) => {

    const sql = `
        SELECT
            users.name,
            users.email,
            events.title,
            bookings.status,
            bookings.booking_date
        FROM bookings
        JOIN users
            ON bookings.user_id = users.id
        JOIN events
            ON bookings.event_id = events.id
    `;

    db.query(sql, (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        res.render("admin-bookings", {
            bookings: results
        });

    });

});
app.get("/admin/reports",  isAdmin,(req, res) => {

    db.query(
        "SELECT COUNT(*) AS totalUsers FROM users",
        (err, usersResult) => {

            db.query(
                "SELECT COUNT(*) AS totalEvents FROM events",
                (err, eventsResult) => {

                    db.query(
                        "SELECT COUNT(*) AS totalBookings FROM bookings",
                        (err, bookingsResult) => {

                            db.query(
                                "SELECT COUNT(*) AS cancelledBookings FROM bookings WHERE status='cancelled'",
                                (err, cancelledResult) => {

                                    res.render("reports", {
                                        totalUsers:
                                            usersResult[0].totalUsers,

                                        totalEvents:
                                            eventsResult[0].totalEvents,

                                        totalBookings:
                                            bookingsResult[0].totalBookings,

                                        cancelledBookings:
                                            cancelledResult[0].cancelledBookings
                                    });

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});
app.get("/admin/edit-event/:id", isAdmin,(req, res) => {

    const id = req.params.id;

    db.query(
        "SELECT * FROM events WHERE id = ?",
        [id],
        (err, results) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            res.render("edit-event", {
                event: results[0]
            });

        }
    );

});
app.post("/admin/update-event", isAdmin, (req, res) => {

    const {
        id,
        title,
        description,
        location,
        category,
        capacity
    } = req.body;

    const sql = `
        UPDATE events
        SET
            title = ?,
            description = ?,
            location = ?,
            category = ?,
            capacity = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [
            title,
            description,
            location,
            category,
            capacity,
            id
        ],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Update Failed");
            }

            res.redirect("/admin/events");

        }
    );

});
app.get("/logout", (req, res) => {

    req.session.destroy(() => {
        res.redirect("/login");
    });

});
app.get("/profile", (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const sql =
        "SELECT name, email, role FROM users WHERE id = ?";

    db.query(
        sql,
        [req.session.userId],
        (err, results) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            res.render("profile", {
                user: results[0]
            });

        }
    );

});
app.get("/admin/users", isAdmin, (req, res) => {

    db.query(
        "SELECT id, name, email, role FROM users",
        (err, results) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            res.render("admin-users", {
                users: results
            });

        }
    );

});
app.post("/admin/change-role", isAdmin, (req, res) => {

    const { id, role } = req.body;

    db.query(
        "UPDATE users SET role = ? WHERE id = ?",
        [role, id],
        (err) => {

            if (err) {
                console.error(err);
                return res.send("Role Update Failed");
            }

            res.redirect("/admin/users");
        }
    );

});
app.post("/admin/delete-user", isAdmin, (req, res) => {

    const id = parseInt(req.body.id);

if (id === req.session.userId) {
    return res.send("You cannot delete your own account.");
}

    db.query(
        "DELETE FROM bookings WHERE user_id = ?",
        [id],
        (err) => {

            if (err) {
                console.error(err);
                return res.send("Failed to delete bookings");
            }

            db.query(
                "DELETE FROM users WHERE id = ?",
                [id],
                (err) => {

                    if (err) {
                        console.error(err);
                        return res.send("Failed to delete user");
                    }

                    res.redirect("/admin/users");

                }
            );

        }
    );

});
app.get('/about', (req, res) => {
    res.render('about');
});
// =========================
// Start Server
// =========================
app.listen(3000, () => {
console.log("Server running on port 3000");
});