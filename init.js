const dotenv = require('dotenv')
const AWS = require('aws-sdk') 

dotenv.config()

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_ACCESS_SECRET
})

const params = {
  Bucket: process.env.S3_BUCKET, 
  Key: "spoilers.json", 
}

s3.putObject({ ...params, Body: JSON.stringify([]), ServerSideEncryption: "AES256"}, function(err, data) {
  if (err) console.log(err, err.stack) 
  else {
    console.log('Done!')
  }              
})