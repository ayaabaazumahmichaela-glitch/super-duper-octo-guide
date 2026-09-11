const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

console.log(
  "PAYSTACK KEY LOADED:",
  !!process.env.PAYSTACK_SECRET_KEY
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve website files
app.use(express.static(path.join(__dirname, "public")));

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ============================================================
// BOOKS
// ============================================================

const BOOKS = {

  shadow: {
    name: "The Boy Who Sold His Shadow",
    amount: 2000,
    price: "GH¢20",
    file: "The_Boy_Who_Sold_His_Shadow_Illustrated.pdf",
    downloadName: "The_Boy_Who_Sold_His_Shadow_Illustrated.pdf"
  },

  village: {
    name: "The Village That Forgot Its Name",
    amount: 2000,
    price: "GH¢20",
    file: "the_village_that_forgot_its_name.pdf",
    downloadName: "the_village_that_forgot_its_name.pdf"
  }

};


// ============================================================
// INITIALIZE PAYSTACK PAYMENT
// ============================================================

app.post("/api/initialize", async (req, res) => {

  try {

    if (!SECRET_KEY) {
      return res.status(500).json({
        error: "Payment system is not configured."
      });
    }

    const { email, bookId } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    if (!bookId || !BOOKS[bookId]) {
      return res.status(400).json({
        error: "Please select a valid book."
      });
    }

    const book = BOOKS[bookId];

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          email: email,
          amount: book.amount,
          currency: "GHS",

          metadata: {
            bookId: bookId,
            product: book.name,
            price: book.price
          },

          callback_url:
            "https://smartbio-books.onrender.com/api/download"
        })
      }
    );

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({
        error:
          data.message ||
          "Payment could not be started."
      });
    }

    res.json({
      authorization_url:
        data.data.authorization_url
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong."
    });

  }

});


// ============================================================
// VERIFY PAYMENT AND DOWNLOAD BOOK
// ============================================================

app.get("/api/download", async (req, res) => {

  try {

    if (!SECRET_KEY) {
      return res.status(500).send(
        "Payment system is not configured."
      );
    }

    const reference = req.query.reference;

    if (!reference) {
      return res.status(400).send(
        "Missing payment reference."
      );
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!data.status || !data.data) {
      return res.status(403).send(
        "Payment could not be verified."
      );
    }

    const transaction = data.data;

    if (
      transaction.status !== "success" ||
      transaction.currency !== "GHS"
    ) {
      return res.status(403).send(
        "Payment could not be verified."
      );
    }

    let metadata = transaction.metadata;

    if (typeof metadata === "string") {

      try {
        metadata = JSON.parse(metadata);
      } catch (error) {
        return res.status(403).send(
          "Invalid payment information."
        );
      }

    }

    const bookId =
      metadata && metadata.bookId;

    const book =
      BOOKS[bookId];

    if (!book) {
      return res.status(403).send(
        "Book could not be identified."
      );
    }

    if (
      transaction.amount !== book.amount
    ) {
      return res.status(403).send(
        "Payment amount could not be verified."
      );
    }

    res.download(
      path.join(__dirname, book.file),
      book.downloadName,
      (error) => {

        if (error) {
          console.error(error);
        }

      }
    );

  } catch (error) {

    console.error(error);

    res.status(500).send(
      "Download verification failed."
    );

  }

});


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {

  console.log(
    `His-Story Books running on port ${PORT}`
  );

});
