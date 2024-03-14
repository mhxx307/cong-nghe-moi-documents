require("dotenv").config();
const multer = require("multer");
var express = require("express");
var app = express();
var AWS = require("aws-sdk");
var path = require("path");

// app config
app.use(express.static("views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ejs configuration
app.set("view engine", "ejs");
app.set("views", "./views");

// multer config
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1000000 },
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    }
    return cb("error");
}

// aws connection
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";

AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
});

const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// app routes
app.get("/", async function (req, res) {
    try {
        const params = { TableName: process.env.TABLE_NAME };
        S;
        const data = await dynamoDB.scan(params).promise();
        console.log("data", data);
        return res.render("index", {
            products: data.Items,
            error: "",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send("internal server error");
    }
});

app.post("/add", upload.single("image"), async (req, res) => {
    try {
        const { maSP, tenSP, soLuong } = req.body;
        console.log("req.file", req.file);
        const image = req.file?.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${maSP}_${Date.now().toString()}.${fileType}`;

        const paramS3 = {
            Bucket: process.env.BUCKET_NAME,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        s3.upload(paramS3, async (err, data) => {
            if (err) {
                console.error(err);
                return res.status(500).send("internal server error");
            } else {
                const url = data.Location;
                const paramsDynamodb = {
                    TableName: process.env.TABLE_NAME,
                    Item: {
                        maSP,
                        tenSP,
                        soLuong,
                        image: url,
                    },
                };
                await dynamoDB.put(paramsDynamodb).promise();
                return res.redirect("/");
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send("internal server error");
    }
});

app.post("/delete", async (req, res) => {
    const listCheckboxSelected = Object.keys(req.body);
    console.log("listCheckboxSelected", listCheckboxSelected);
    if (!listCheckboxSelected || listCheckboxSelected.length <= 0) {
        return res.redirect("/");
    }

    try {
        function onDeleteItem(length) {
            const params = {
                TableName: process.env.TABLE_NAME,
                Key: {
                    maSP: listCheckboxSelected[length],
                },
            };

            dynamoDB.delete(params, (err, data) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("internal server error");
                } else if (length > 0) {
                    onDeleteItem(length - 1);
                } else {
                    return res.redirect("/");
                }
            });
        }

        onDeleteItem(listCheckboxSelected.length - 1);
    } catch (error) {
        console.error(error);
        return res.status(500).send("internal server error");
    }
});

app.listen(8000, () => {
    console.log("server running in port 8000");
});
