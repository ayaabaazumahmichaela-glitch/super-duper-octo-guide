const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

console.log(
    "Paystack key loaded:",
    SECRET_KEY ? "YES" : "NO"
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));


/* =========================
   HOME PAGE
========================= */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );

});


/* =========================
   BOOKS
========================= */

const BOOKS = {

    shadow: {
        name: "The Boy Who Sold His Shadow",
        amount: 2000,
        price: "GH¢20",
        file: "The_Boy_Who_Sold_His_Shadow_Illustrated.pdf"
    },

    village: {
        name: "The Village That Forgot Its Name",
        amount: 2000,
        price: "GH¢20",
        file: "The_Village_That_Forgot_Its_Name_FINAL.pdf"
    },

    nkrumah: {
        name: "The History of Osagyefo Dr. Kwame Nkrumah",
        amount: 2500,
        price: "GH¢25",
        file: "the_history_of_osagyefo_dr_kwame_nkrumah.pdf"
    },

    ghana: {
        name: "The History of Ghana",
        amount: 2500,
        price: "GH¢25",
        file: "the_history_of_ghana.pdf"
    },

    emptyThrone: {
        name: "The Empty Throne",
        amount: 2000,
        price: "GH¢20",
        file: "The_Empty_Throne_His-Story.pdf"
    },

    worldWar2: {
        name: "The History of World War II",
        amount: 2500,
        price: "GH¢25",
        file: "The_History_of_World_War_II_His-Story.pdf"
    }

};


/* =========================
   INITIALIZE PAYSTACK
========================= */

app.post("/api/initialize", async (req, res) => {

    try {

        if (!SECRET_KEY) {

            return res.status(500).json({
                error: "Payment system is not configured."
            });

        }


        const {
            email,
            bookId
        } = req.body;


        if (!email) {

            return res.status(400).json({
                error: "Email is required."
            });

        }


        if (!bookId || !BOOKS[bookId]) {

            return res.status(400).json({
                error: "Invalid book selected."
            });

        }


        const book = BOOKS[bookId];


        const response = await fetch(
            "https://api.paystack.co/transaction/initialize",
            {

                method: "POST",

                headers: {

                    "Authorization":
                        `Bearer ${SECRET_KEY}`,

                    "Content-Type":
                        "application/json"

                },

                body: JSON.stringify({

                    email: email,

                    amount: book.amount,

                    currency: "GHS",

                    callback_url:
                        "https://smartbio-books.onrender.com/api/download",

                    metadata: {

                        bookId: bookId,

                        product: book.name,

                        price: book.price

                    }

                })

            }
        );


        const data =
            await response.json();


        if (!response.ok || !data.status) {

            console.error(
                "Paystack initialize error:",
                data
            );

            return res.status(400).json({

                error:
                    data.message ||
                    "Unable to initialize payment."

            });

        }


        return res.json({

            authorization_url:
                data.data.authorization_url,

            reference:
                data.data.reference

        });


    } catch (error) {

        console.error(
            "Initialize error:",
            error
        );

        return res.status(500).json({

            error:
                "Something went wrong while starting payment."

        });

    }

});


/* =========================
   VERIFY PAYMENT & DOWNLOAD
========================= */

app.get("/api/download", async (req, res) => {

    try {

        if (!SECRET_KEY) {

            return res.status(500).send(
                "Payment system is not configured."
            );

        }


        const reference =
            req.query.reference;


        if (!reference) {

            return res.status(400).send(
                "Payment reference is missing."
            );

        }


        const response = await fetch(

            `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,

            {

                method: "GET",

                headers: {

                    "Authorization":
                        `Bearer ${SECRET_KEY}`

                }

            }

        );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.status ||
            !data.data
        ) {

            console.error(
                "Paystack verification error:",
                data
            );

            return res.status(400).send(
                "Unable to verify payment."
            );

        }


        const transaction =
            data.data;


        if (transaction.status !== "success") {

            return res.status(400).send(
                "Payment was not successful."
            );

        }


        if (transaction.currency !== "GHS") {

            return res.status(400).send(
                "Invalid payment currency."
            );

        }


        const metadata =
            transaction.metadata || {};


        const bookId =
            metadata.bookId;


        if (!bookId || !BOOKS[bookId]) {

            return res.status(400).send(
                "Book information is missing."
            );

        }


        const book =
            BOOKS[bookId];


        if (
            Number(transaction.amount) !==
            Number(book.amount)
        ) {

            return res.status(400).send(
                "Payment amount does not match the book price."
            );

        }


        const filePath =
            path.join(
                __dirname,
                "public",
                book.file
            );


        if (!fs.existsSync(filePath)) {

            console.error(
                "Book file not found:",
                filePath
            );

            return res.status(404).send(
                "The book file could not be found."
            );

        }


        console.log(
            `Payment verified for: ${book.name}`
        );


        return res.download(
            filePath,
            book.file
        );


    } catch (error) {

        console.error(
            "Download error:",
            error
        );

        return res.status(500).send(
            "Something went wrong while processing your download."
        );

    }

});


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

    console.log(
        `His-Story server running on port ${PORT}`
    );

});
