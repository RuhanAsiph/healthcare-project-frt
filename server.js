const express = require("express");
const app = express();
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const ejs = require("ejs");

//initialize config file 
//dotenv.config({path: './config.env'})


//azure healthbot
const crypto = require('crypto');
const path = require("path");
const jwt = require("jsonwebtoken");
const rp = require("request-promise");
const cookieParser = require('cookie-parser');
const { dirname } = require("path");
const WEBCHAT_SECRET = process.env.APPSETTING_WEBCHAT_SECRET;
const DIRECTLINE_ENDPOINT_URI = process.env.APPSETTING_DIRECTLINE_ENDPOINT_URI;
const APP_SECRET = process.env.APPSETTING_APP_SECRET;
const directLineTokenEp = `https://${DIRECTLINE_ENDPOINT_URI || "directline.botframework.com"}/v3/directline/tokens/generate`;


app.set("view engine", "ejs");



app.use(express.urlencoded({extended: true}));
app.use(express.json()) // To parse the incoming requests with JSON payloads
app.use(cookieParser());
let options = {};
//serve static files 
//app.use(express.static(`${__dirname}/frontend`));
app.use(express.static(path.join(__dirname, "frontend"), options));
//mongodb database
//const DB = process.env.DATABASE.replace(
//    '<PASSWORD>', 
//    process.env.DATABASE_PASSWORD
//);

//cosmos-db database
const dbTwo = process.env.APPSETTING_databaseTwo.replace(
    '<primary_master_key>', process.env.APPSETTING_databaseTwoKey
); 

//mopngoose 
mongoose.connect(dbTwo, { useNewUrlParser: true, useUnifiedTopology: true}).then(con => {
    console.log('db con successful');
});

//create schema 
const productsSchema = {
    name: {
        type: String,
        required: true
    },
    number: String,
    email: String
}

//create model 
const Product = mongoose.model("Product", productsSchema);

//display static pages 
app.get('/', (req,res) => {
    Product.find({}, function(err, products) {
        res.render('index', {
          productsList: products
        })
    });
});
app.get('/appointments', (req,res) => {
    Product.find({}, function(err, products) {
        res.render('appointments', {
          productsList: products
        })
    });
    
});
app.get('/schedule', (req,res) => {
    res.sendFile(__dirname + "/frontend/schedule.html");
});
app.get('/chatbot', (req,res) => {
    res.sendFile(__dirname + "/frontend/chatbot.html");
});

//api
//handler func
const createAppointment = async (req, res) => {
    try {
    // let newProd = new Product({
    //     name: req.body.name,
    //     number: req.body.number,
    //     email: req.body.email
    // })
    // newProd.save();
    // res.redirect('/appointments');

    const newProd = await Product.create(req.body);
    res.redirect('/appointments');
    } catch (err) {
        res.status(400).json({
            status: "fail",
            message: "invalid data sent"
        })
    }
};
const getAppointment = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        res.status(200).json({
            status: "success",
            data: {
                product
            }
        });
    } catch (err) {
        res.status(400).json({
            status: "fail",
            message: "invalid data sent"
        })
    }
};

//app.post 
//app.post('/api/v1/appointments', createAppointment);

//routes
const productRouter = express.Router();
productRouter.route('/').post(createAppointment);
productRouter.route('/:id').get(getAppointment);
app.use('/api/v1/appointments', productRouter);


//start
const region = process.env.APPSETTING_REGION || "Unknown";
const port = process.env.APPSETTING_PORT
app.listen(port || 5040, function(){
    console.log('server started');
});
 



//azure healthbot
function isUserAuthenticated(){
    // add here the logic to verify the user is authenticated
    return true;
}

const appConfig = {
    isHealthy : false,
    options : {
        method: 'POST',
        uri: directLineTokenEp,
        headers: {
            'Authorization': 'Bearer ' + WEBCHAT_SECRET
        },
        json: true
    }
};

function healthResponse(res, statusCode, message) {
    res.status(statusCode).send({
        health: message,
        region: region
    });
}
function healthy(res) {
    healthResponse(res, 200, "Ok");
}

function unhealthy(res) {
    healthResponse(res, 503, "Unhealthy");
}

app.get('/health', function(req, res){
    if (!appConfig.isHealthy) {
        rp(appConfig.options)
            .then((body) => {
                appConfig.isHealthy = true;
                healthy(res);
            })
            .catch((err) =>{
                unhealthy(res);
            });
    }
    else {
        healthy(res);
    }
});

app.post('/chatBot',  function(req, res) {
    if (!isUserAuthenticated()) {
        res.status(403).send();
        return;
    }
    rp(appConfig.options)
        .then(function (parsedBody) {
            var userid = req.query.userId || req.cookies.userid;
            if (!userid) {
                userid = crypto.randomBytes(4).toString('hex');
                res.cookie("userid", userid);
            }

            var response = {};
            response['userId'] = userid;
            response['userName'] = req.query.userName;
            response['locale'] = req.query.locale;
            response['connectorToken'] = parsedBody.token;

            /*
            //Add any additional attributes
            response['optionalAttributes'] = {age: 33};
            */

            if (req.query.lat && req.query.long)  {
                response['location'] = {lat: req.query.lat, long: req.query.long};
            }
            response['directLineURI'] = DIRECTLINE_ENDPOINT_URI;
            const jwtToken = jwt.sign(response, APP_SECRET);
            res.send(jwtToken);
        })
        .catch(function (err) {
            appConfig.isHealthy = false;
            res.status(err.statusCode).send();
            console.log("failed");
        });
});
