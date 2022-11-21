require('dotenv').config()
require('colors')
const  mysql  = require('mysql')
const request = require('request')
const fs      = require('fs')
const slugify      = require('slugify')
const { JSDOM } = require( "jsdom" );
const { window } = new JSDOM( "" );

const $ = require( "jquery" )( window );

const BASEURL = "https://www.zdescargas.org";

const  db = mysql.createConnection({
    host     : process.env.DB_HOST,
    user     : process.env.DB_USER,
    password : process.env.DB_PASS,
    database : process.env.DB_NAME
});



const call = async (url) => {
    return new Promise(resolve=>{
        request(url, (error, response, body)=>{
            if (error) {
                console.log(error)
                return resolve(null)
            }
            resolve(body)
        })
    })
}

const write = (filename, html) => {
    fs.writeFileSync("downloads/" + filename, html)
}
const executeDB = async (sql, params) => {
    return new Promise(resolve=>{
        db.query(sql, params, (error, results, fields)=>{
            if (error) return resolve(false)
            resolve(true)
        });
    })
}
const queryDB = async (sql, params) => {
    return new Promise(resolve=>{
        db.query(sql, params, (error, results, fields)=>{
            if (error) return resolve(null)
            resolve(results)
        });
    })
}
const crawling = async (url) => {
    try {
        let html = await call(url);
        write("home.html", html)
        let hs = $(html);
        let as = hs.find("div.categorias ul li");
        for(let v of as) {
            let classes = $(v).attr("class").split(/\s+/);
            if (classes[1].indexOf("cat-item-")!==-1) {
                let id = Number(classes[1].slice(9))
                let a = $(v).find('a')
                let text = $(a).text();
                let href = $(a).attr('href').replace('https://www.zdescargas.org', '');
                await executeDB("INSERT INTO categories(id, text, url) VALUES (?, ?, ?)  ON DUPLICATE KEY UPDATE text=VALUES(text),url=VALUES(url);", [id, text, href])
                await crawlCategory(id, text, href)
            }
        }
    } catch (err) {
        console.log(err)
    }
}
const crawlCategory = async (pid, title, url, page=1) => {
    try {
        console.log('#'+pid + ' - ' + title.yellow + ' - page #' + page)
        if (page===1) await executeDB("DELETE FROM products WHERE pid=?", [pid])
        let html = await call(BASEURL + url + (page>1 ? '/page/' + page : ''));
        write(pid+'-'+slugify(title)+'-'+page+".html", html)
        let hs = $(html);
        let as = hs.find("div#primary-content .bloque-interno #contenidoz a");
        for(let v of as) {
            let href = $(v).attr('href').replace('https://www.zdescargas.org', '')
            let text = $(v).attr('title')
            await executeDB("INSERT INTO products(pid, text, url) VALUES (?, ?, ?)  ON DUPLICATE KEY UPDATE text=VALUES(text),url=VALUES(url);", [pid, text, href])
        }
        let ps = hs.find("div#primary-content .bloque-interno .navigation li");
        if (ps.length) {
            for(let v of ps) {
                // let href = $(v).attr('href').replace('https://www.zdescargas.org', '')
                let text = $(v).text()
                if (!isNaN(text)) {
                    if (page+1===Number(text)) {
                        await crawlCategory(pid, title, url, page+1)
                        break;
                    }
                }
            }
        }
        console.log('       '+'complete'.green)
    } catch (err) {
        console.log(err)
    }
}

const crawlContents = async (pid, id, url) => {
    try {
        console.log('#'+(pid + ' - ' + id).yellow)
        let html = await call(BASEURL + url);
        write(pid + ' - ' + id + ".html", html)
        let hs = $(html);
        let as = hs.find("div#primary-content .bloque-interno .post-content p");
        let ts = [];
        for(let v of as) {
            let text = $(v).text().trim()
            if (text) {
                ts.push(text)
            }
        }
        await executeDB("UPDATE products SET contents=? WHERE id=?", [ts.join('\r\n'), id])
        console.log('       '+'complete'.green)
    } catch (err) {
        console.log(err)
    }
}

const reaqCategories = async () => {
    const rows = await queryDB("SELECT * FROM categories ORDER BY id")
    if (rows) {
        for(let v of rows) {
            await crawlCategory(v.id, v.text, v.url)
        }
    }
}

const reaqContents = async () => {
    const rows = await queryDB("SELECT * FROM products WHERE ISNULL(contents) ORDER BY id")
    if (rows) {
        for(let v of rows) {
            await crawlContents(v.pid, v.id, v.url)
        }
    }
}

(async function(){
    db.connect()
    // await crawling(BASEURL);
    // await reaqCategories()
    await reaqContents();
    db.end();
})()