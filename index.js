const dotenv = require('dotenv')
const AWS = require('aws-sdk') 
const request = require('request-promise')

dotenv.config()

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_ACCESS_SECRET
})

const params = {
  Bucket: process.env.S3_BUCKET, 
  Key: `spoilers-${process.env.MTG_SET}.json`, 
}
const scryfallUrl = `https://api.scryfall.com/cards/search?order=set&q=e%3A${process.env.MTG_SET}&unique=prints`
const spoilerPageUrl = `https://scryfall.com/sets/${process.env.MTG_SET}?order=spoiled`

const mapColorEmoji = color => {
  switch(color) {
    case 'W': return 'white'
    case 'U': return 'blue'
    case 'B': return 'black'
    case 'R': return 'red'
    case 'G': return 'green'
    case 'S': return 'snow'
    case 'C': return 'colorless'
    case 'B/G': return 'bg'
    case 'B/R': return 'br'
    case 'G/U': return 'gu'
    case 'G/W': return 'gw'
    case 'R/G': return 'rg'
    case 'U/B': return 'ub'
    case 'U/R': return 'ur'
    case 'W/B': return 'wb'
    case 'W/U': return 'wu'
    case 'T': return 'tap'
    default: return color
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const emojify = text => text.replace(/{([\dXWURBGSTC/]+)}/g, (match, p1) => `:mtg-${mapColorEmoji(p1)}:`.toLocaleLowerCase())

async function sendNotification(count) {
  const options = {
    method: 'POST',
    uri: 'https://slack.com/api/chat.postMessage',
    headers: { Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}` },
    body: {
      channel: process.env.SLACK_CHANNEL,
      as_user: false,
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `${count} new spoilers! View in <${spoilerPageUrl}|scryfall>`
          }
        }
      ]
    },
    json: true 
  }
  return request.post(options) 
}

async function sendCard(card) {
  const manaCost = emojify(card.mana_cost)
  const oracle = emojify(card.oracle_text)
  const loyalty = card.loyalty ? `Loyalty: ${card.loyalty} `:''
  const type = card.type_line
  const name = card.name
  const pt = type.includes('Creature') && card.power && card.toughness ? `${card.power}/${card.toughness} ` : ''
  const rarity = card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1) //Javascript wtfbbq?!

  const options = {
    method: 'POST',
    uri: 'https://slack.com/api/chat.postMessage',
    headers: { Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}` },
    body: {

      channel: process.env.SLACK_CHANNEL,
      as_user: false,
      blocks: [
       {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*${name}* ${manaCost}\n\n${type} ${pt||loyalty}· ${rarity}\n\n${oracle}\n\nIllustrated by: ${card.artist}`
          },
          "accessory": {
            "type": "image",
            "image_url": card.image_uris.art_crop,
            "alt_text": name
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `<${card.scryfall_uri}|View in scryfall>`
          }
        },
        
      ]
    },
    json: true 
  }
  return request.post(options) 
}

async function createSetFile() {
  try {
    await s3.putObject({ ...params, Body: JSON.stringify([]), ServerSideEncryption: "AES256"}).promise()
  } catch(err) {
    console.log(err)
  }
}

;(async () => {

  try {
    await s3.headObject(params).promise()
  } catch (err) {
    if(err.code === 'NotFound') {
      await createSetFile()
    }
  }

  s3.getObject(params, async (err, data) => {
    if (err) {
      console.log(err, err.stack)
    } else {
      const spoiled = JSON.parse(data.Body.toString())
      let cards = await request.get(scryfallUrl, { json: true })
      if(cards.total_cards > spoiled.length){
        let allCards = cards.data

        while(cards.next_page) {
          cards = await request.get(cards.next_page, { json: true })
          allCards = allCards.concat(cards.data)
        }
        
        const newCards = allCards.filter((card) => !spoiled.includes(card.id))

        if (newCards.length > process.env.LIMIT) {
          await sendNotification(newCards.length)
        } else {
          await Promise.all(newCards.map(async (card) => {
            await sendCard(card)
            await delay(1000)
          }))
        }
        
        const updatedIdList = spoiled.concat(newCards.map(card => card.id))
        s3.putObject({ ...params, Body: JSON.stringify(updatedIdList), ServerSideEncryption: "AES256"}, function(err, data) {
          if (err) console.log(err, err.stack) 
          else {
            console.log('Updated spoilers')
          }              
        })
      } else {
        console.log('No new spoilers')
      }
    }
  })

})()
