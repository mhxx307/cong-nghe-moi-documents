require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;
const AWS = require("aws-sdk");
const multer = require("multer");
const path = require("path");

process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
});
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("views"));
app.set("view engine", "ejs");
app.set("views", "./views");

// set up multer
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    },
});

const checkFileType = (file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    console.log(file);
    console.log(extname, mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    }

    return cb("error type file");
};

app.get("/", async (req, res) => {
    try {
        const params = {
            TableName: process.env.TABLE_NAME,
        };

        const data = await dynamoDB.scan(params).promise();
        const products = data.Items;

        return res.render("index.ejs", {
            products: products || [],
        });
    } catch (error) {
        console.log("error", error);
        return res.status(500).send("Internal Server Error");
    }
});

app.post("/add", upload.single("image"), async (req, res) => {
    try {
        const { maSanPham, tenSanPham, soLuong } = req.body;
        console.log(req.file);
        const image = req.file?.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`;

        const paramsS3 = {
            Bucket: process.env.BUCKET_NAME,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        s3.upload(paramsS3, async (err, data) => {
            if (err) {
                console.log("error", err);
                return res.status(500).send("Internal Server Error");
            } else {
                const url = data.Location;
                const params = {
                    TableName: process.env.TABLE_NAME,
                    Item: {
                        maSanPham: maSanPham,
                        tenSanPham: tenSanPham,
                        soLuong: soLuong,
                        image: url,
                    },
                };

                await dynamoDB.put(params).promise();
                return res.redirect("/");
            }
        });
    } catch (error) {
        console.log("error", error);
        return res.status(500).send("Internal Server Error");
    }
});

app.post("/delete", (req, res) => {
    const listCheckedSelected = Object.keys(req.body);
    if (!listCheckedSelected || listCheckedSelected.length <= 0) {
        return res.redirect("/");
    }

    try {
        function onDeleteItem(length) {
            const params = {
                TableName: process.env.TABLE_NAME,
                Key: {
                    maSanPham: listCheckedSelected[length],
                },
            };

            dynamoDB.delete(params, (err, data) => {
                if (err) {
                    console.log("error", err);
                    return res.status(500).send("Internal Server Error");
                } else if (length > 0) {
                    onDeleteItem(length - 1);
                } else {
                    return res.redirect("/");
                }
            });
        }

        onDeleteItem(listCheckedSelected.length - 1);
    } catch {
        console.log("error", error);
        return res.status(500).send("Internal Server Error");
    }
});

app.listen(port, () => {
    console.log(`start at localhost:${port}`);
});
