const express = require('express');

const app = express();

app.use(express.json());

app.post('/api/events', async (req, res) => {
    res.json({ success: true });
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
