require('dotenv').config({
    path: '.env.local'
});

const Datastore = require('nedb');
const db = new Datastore({ filename: 'history.json', autoload: true });

const express = require('express');
const axios = require('axios');
const qs = require('querystring');

const bodyParser = require('body-parser');
const Busboy = require('busboy');

const MemoryStream = require('memorystream');

const { StringDecoder } = require('string_decoder');
const decoder = new StringDecoder('utf8');

const multipartDetector = function(req, res, next) {
    if(req.headers['content-type'] && req.headers['content-type'].indexOf('multipart/form-data') !== -1) {

        let busboy = new Busboy({ headers: req.headers });
    
        busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
            console.log('File [' + fieldname + ']: filename: ' + filename + ', encoding: ' + encoding + ', mimetype: ' + mimetype);

            let memStream = new MemoryStream();

            file.on('data', function(data) {
                console.log('File [' + fieldname + '] got ' + data.length + ' bytes');
            });

            file.on('end', function(...args) {
                console.log('File [' + fieldname + '] Finished', args);

                req.body[fieldname] = {
                    filename,
                    encoding, 
                    mimetype,
                    stream: memStream
                }

                req.body['streams'] = req.body['streams'] || {};
                req.body.streams[fieldname] = req.body[fieldname];

            });

            file.pipe(memStream);
        });

        busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
            console.log('Field [' + fieldname + ']: value: ' + val, fieldnameTruncated, valTruncated, encoding, mimetype);
            try {
                val = JSON.parse(val);
            }
            catch(err) {
            }

            req.body[fieldname] = val;
        });
    
        busboy.on('finish', function() {
            console.log('Done parsing form!');

            next();
        });
    
        req.pipe(busboy);

    }
    else next();
};

const app = express();

//app.use(express.json());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


const dialogflow = require('dialogflow');
const uuid = require('uuid');

const runSample = async ({ projectId = 'small-talk-b2722', text = 'Привет!', sessionId = uuid.v4()}) => {

    // Create a new session
    const sessionClient = new dialogflow.SessionsClient();
    const sessionPath = sessionClient.sessionPath(projectId, sessionId);

    // The text query request.
    const request = {
        session: sessionPath,
        queryInput: {
            text: {
                // The query to send to the dialogflow agent
                text,
                // The language used by the client (en-US)
                languageCode: 'ru-RU',
            },
        },
    };

    // Send request and log result
    const responses = await sessionClient.detectIntent(request);
    console.log('Detected intent');

    const result = responses[0].queryResult;
    console.log(`  Query: ${result.queryText}`);
    console.log(`  Response: ${result.fulfillmentText}`);

    if (result.intent) {
        console.log(`  Intent: ${result.intent.displayName}`);
    } else {
        console.log(`  No intent matched.`);
    }

    return result.fulfillmentText;
}

const sendMessage = async ({ text, number }) => {
    let response = await axios({
        method: 'post',
        url: 'https://ru12-w.talk-api.com/api/2078/10cab25cdfcd737eb2e/sendMsg',
        //data: form,
        data: qs.stringify({
            text,
            number
        }),
        config: { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    }).catch(err => console.log('>>> ERROR', JSON.stringify(err, void 0, 2)));

    return response;
}

app.all('/hook', async (req, res) => {
    let body = {};

    try {
        body = Object.keys(req.body).map(key => JSON.parse(key)).pop();
    }
    catch(err) {
        body = req.body;
    }

    let text = body.message ? decoder.write(body.message.text) : `NO MSG - ${Object.entries(body)}`;

    console.log('>>> TEXT', text);
    console.log('>>> BODY', JSON.stringify(body, void 0, 2));

    if(body.message) {
        let caller = body.message.from ? body.message.from.split('@').shift() : '79009395505';

        if(caller !== '79009395505') {
            let response = await runSample({ text, sessionId: caller });
            let status = await sendMessage({ text: response, number: caller });

            let record = {
                from: caller,
                request: text,
                response,
                date: Date.now()
            };

            db.insert(record);
        }
    }

    res.json({ status: 'ok' });
});

/* app.all('/send', async function (req, res) {

    text = req.body.text || req.query.text;
    number = req.body.number || req.query.number;

    if(text && number) {
        let response = await sendMessage({ text, number });
    
        console.log('>>> SEND', response && response.data);
    
        res.json({ status: 'ok', response: response.data });

        //runSample({ text, sessionId: '10001' });
    }
    else res.json({ status: 'error', message: 'no text or/and number' });
}); */

app.listen(8000, function () {
  console.log('Example app listening on port 8000!');
});