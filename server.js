const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
console.log("PAYSTACK KEY LOADED:", !!process.env.PAYSTACK_SECRET_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the website files
app.use(express.static(path.join(__dirname, "public")));

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Paystack payment
app.post("/api/initialize", async (req, res) => {
  try {
    if (!SECRET_KEY) {
      return res.status(500).json({
        error: "Payment system is not configured."
      });
    }

    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

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
          amount: 3000,
          currency: "GHS",
          metadata: {
            product: "Organisms",
            price: "GH¢30"
          },
            callback_url:
    "https://smartbio-books.onrender.com/api/download"
        })
      }
    );

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({
        error: data.message || "Payment could not be started."
      });
    }

    res.json({
      authorization_url: data.data.authorization_url
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Something went wrong."
    });
  }
});

// Verify payment and allow PDF download
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

    if (
      !data.status ||
      data.data.status !== "success" ||
      data.data.amount !== 3000 ||
      data.data.currency !== "GHS"
    ) {
      return res.status(403).send(
        "Payment could not be verified."
      );
    }
    res.download(
  path.join(__dirname, "public", "organisms.pdf"),
  "SmartBio-Books-Organisms.pdf"
);

  } catch (error) {
    console.error(error);

    res.status(500).send(
      "Download verification failed."
    );
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    `SmartBio Books running on port ${PORT}`
  );
});
