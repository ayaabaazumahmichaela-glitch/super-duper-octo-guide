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

// ============================================================
// SERVE WEBSITE
// ============================================================

app.use(express.static(path.join(__dirname, "public")));

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
    file: "The_Village_That_Forgot_Its_Name_FINAL.pdf",
    downloadName: "The_Village_That_Forgot_Its_Name_FINAL.pdf"
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

    if (!data.status || !data.data) {
      console.error("Paystack initialization error:", data);

      return res.status(400).json({
        error:
          data.message ||
          "Payment could not be started."
      });
    }

    return res.json({
      authorization_url:
        data.data.authorization_url
    });

  } catch (error) {
    console.error(
      "INITIALIZE ERROR:",
      error
    );

    return res.status(500).json({
      error: "Something went wrong while starting payment."
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

    console.log(
      "VERIFYING PAYMENT:",
      reference
    );

    // --------------------------------------------------------
    // Verify transaction with Paystack
    // --------------------------------------------------------

    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15000
    );

    let response;

    try {
      response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(
          reference
        )}`,
        {
          method: "GET",

          headers: {
            Authorization: `Bearer ${SECRET_KEY}`
          },

          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    console.log(
      "PAYSTACK VERIFICATION RESPONSE:",
      JSON.stringify(data)
    );

    if (!response.ok || !data.status || !data.data) {
      return res.status(403).send(
        "Payment could not be verified."
      );
    }

    const transaction = data.data;

    // --------------------------------------------------------
    // Check payment status
    // --------------------------------------------------------

    if (
      transaction.status !== "success"
    ) {
      return res.status(403).send(
        "Payment has not been completed successfully."
      );
    }

    // --------------------------------------------------------
    // Check currency
    // --------------------------------------------------------

    if (
      transaction.currency !== "GHS"
    ) {
      return res.status(403).send(
        "Payment currency could not be verified."
      );
    }

    // --------------------------------------------------------
    // Read metadata
    // --------------------------------------------------------

    let metadata =
      transaction.metadata;

    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch (error) {
        console.error(
          "METADATA PARSE ERROR:",
          error
        );

        return res.status(403).send(
          "Invalid payment information."
        );
      }
    }

    const bookId =
      metadata && metadata.bookId;

    if (!bookId) {
      return res.status(403).send(
        "Book information was not found in the payment."
      );
    }

    const book = BOOKS[bookId];

    if (!book) {
      return res.status(403).send(
        "Book could not be identified."
      );
    }

    // --------------------------------------------------------
    // Check amount
    // --------------------------------------------------------

    if (
      Number(transaction.amount) !==
      Number(book.amount)
    ) {
      return res.status(403).send(
        "Payment amount could not be verified."
      );
    }

    // --------------------------------------------------------
    // Find PDF
    // --------------------------------------------------------

    const filePath = path.join(
      __dirname,
      book.file
    );

    console.log(
      "BOOK FILE:",
      filePath
    );

    // --------------------------------------------------------
    // Check that PDF exists
    // --------------------------------------------------------

    const fs = require("fs");

    if (!fs.existsSync(filePath)) {
      console.error(
        "PDF NOT FOUND:",
        filePath
      );

      return res.status(404).send(
        "The purchased book file could not be found on the server."
      );
    }

    // --------------------------------------------------------
    // Send PDF
    // --------------------------------------------------------

    console.log(
      "SENDING BOOK:",
      book.name
    );

    return res.download(
      filePath,
      book.downloadName,
      (error) => {
        if (error) {
          console.error(
            "DOWNLOAD ERROR:",
            error
          );

          if (!res.headersSent) {
            res.status(500).send(
              "The book could not be downloaded."
            );
          }
        }
      }
    );

  } catch (error) {
    console.error(
      "DOWNLOAD VERIFICATION ERROR:",
      error
    );

    if (
      error.name === "AbortError"
    ) {
      return res.status(504).send(
        "Paystack verification took too long. Please try again."
      );
    }

    return res.status(500).send(
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
