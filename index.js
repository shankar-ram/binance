require('dotenv').config();
const express=require("express");
const Binance = require('node-binance-api');
const cors=require("cors");
var con=require("./database");

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    recvWindow: 60000,
  //   test:true,
    urls: {
      base: "https://testnet.binance.vision/api/"
    },
    adjustForTimeDifference: true,
  });

const app=express();
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({extended:true}));

app.get("/",(req,res)=>{
    res.send("Welcome");
})

app.get("/placeorder",(req,res)=>{
    res.sendFile(__dirname+"/index.html");
})

app.get("/prices",(req,res)=>{
    
    async function asyncCall(){
        let pair="BNBUSDT";
        let ticker = await binance.prices();
        let price;

        Object.entries(ticker).forEach(
            ([key, value]) =>{
                if(key==pair){
                    price=value;
                    console.log(key, value)}
                    
                }
        );
        res.send(ticker);

    }
    asyncCall();
    
})

app.get("/bids",(req,res)=>{
    binance.bookTickers( 'BNBUSDT ',(error, ticker) => {
        console.info("bookTickers", ticker);
        res.send(ticker);
      });
})

app.get("/depth",(req,res)=>{
    binance.depth("BTCUSDT", (error, depth, symbol) => {
        console.info(symbol+" market depth", depth);
        res.send(depth);
      });

   
})

//------------------------First buy order----------------------------
app.post("/order",(req,res)=>{
   
    

    let quantity=req.body.quantity , price=req.body.price, type=req.body.type, pair=req.body.pair ,mode=req.body.mode;
    console.log(quantity,price,pair,type,mode);

    let quotingAsset;
    let assetValue;
    let currPrice;  
    async function asyncCall(){
        
        let ticker = await binance.prices();
        
        // console.info(`Price of BNB: ${ticker.BNBUSDT}`);
        Object.entries(ticker).forEach(
            ([key, value]) =>{
                if(key==pair){
                    currPrice=value;
                    console.log(currPrice);
                    console.log(key, value)}
                    
                }
        );
    }
    asyncCall();

    async function exch(){
        await binance.exchangeInfo((err,data)=>{
            if(err){
                console.log(err)
            }
            console.log(data);
            
            var filtered=Object.values(data.symbols);
         
            for(var i=0;i< filtered.length;i++){
                if(filtered[i].symbol==pair){
                    
                    console.log(filtered[i].filters[1].multiplierDown, filtered[i].filters[1].multiplierUp);
                    
                    if(price>(filtered[i].filters[1].multiplierUp)*currPrice || price<(filtered[i].filters[1].multiplierDown)*currPrice){
                        console.log("Enter the proper range between "+currPrice*(filtered[i].filters[1].multiplierUp) +" and "+currPrice*(filtered[i].filters[1].multiplierDown));
                        return;
                    }
                    quotingAsset=filtered[i].quoteAsset;
                    
                    console.log(filtered[i].symbol);
                }
            }

            binance.balance(async(error, balances) => {
                if ( error ) return console.error(error);
                // console.info("balances()", balances);
                Object.entries(balances).forEach(
                    ([key, value]) =>{
                        if(key==quotingAsset){
                            console.log(key, value.available)}
                            assetValue=value.available;
                        }
                );
              var orderid = '';
                if(assetValue-price>=0){
                    if(type=="LIMIT" && mode=="buy"){
                       var ans = await binance.buy(pair, quantity, price, {type:type}) 
                    console.log("Ans is",ans.orderId);
                    orderid = ans.orderId
                   }
                     else if(type=="MARKET" && mode=="buy"){
                        var ans = await binance.buy(pair, quantity, price, {type:type}) 
                        console.log("Ans is",ans.orderId);
                        orderid = ans.orderId
                    }
                    con.query('INSERT INTO trade SET ?',{type:type, quantity: quantity, price:price, pair:pair, mode:mode,orderId:orderid,orderStatus:"PENDING" },function(error,entry){
                    if(error){
                      console.log(error);
                    }
                    else{
                      console.log(entry);
                    }
                  } 
                  );
                  con.query('Select assigned_no From trade WHERE price=? AND quantity=? AND type=? AND pair=? AND mode=? AND orderId=? AND orderStatus=? ',[price,quantity,type,pair,mode,orderid,"PENDING"],function(error,results){
                    if(error){
                        console.log(error);
                      }
                      else{
                        console.log((results[0].assigned_no));
                        res.send({"assigned_no":results[0].assigned_no,"order_id":orderid,"purchased_quantity":quantity})
                    }
           
                  });
                   
                }   
            });
        
   
        })
        
   
   
    
    }
    exch();
   
    
});



//-------------------------Intermediate sell orders------------------------------
app.post("/fulltrade",(req,res)=>{
    
    let sellingAsset;
    let assetValue;
    let quantity=req.body.quantity , price=req.body.price, mode=req.body.mode,pair=req.body.pair,type=req.body.type,assigned_no=req.body.assigned_no,purchased_quantity=req.body.purchased_quantity;
    
    console.log(pair,assigned_no,quantity,price,mode);

    binance.exchangeInfo((err,data)=>{

        var filtered=Object.values(data.symbols);

        for(var i=0;i<filtered.length;i++){
            if(filtered[i].symbol==pair){
                sellingAsset=filtered[i].baseAsset;
                console.log(sellingAsset);
            }
        }

        if(mode=="sell"){
            binance.balance((error, balances) => {
                if ( error ) return console.error(error);
                // console.info("balances()", balances);
                Object.entries(balances).forEach(
                    ([key, value]) =>{
                        if(key==sellingAsset){
                            console.log(key, value.available)}
                            assetValue=value.available;
                        }
                );
              
                if(purchased_quantity-quantity>=0){
                    con.query('INSERT INTO cont SET ?',{assigned_no:assigned_no, price:price, quantity: quantity,mode:mode },function(error,entry){
                    if(error){
                      console.log(error);
                    }
                    else{
                      console.log(entry);
                    }
                  } 
                  );
                   
                }
                else{
                    console.log("Cannot sell more than you have");
                    return;
                }   
            });
        }
    })    
})

//--------------------------------------- Last sell order-----------------------------------
app.post("/submitorder",(req,res)=>{
    let sellingAsset;
    let assetValue;
    let quantity=req.body.quantity , price=req.body.price, mode=req.body.mode,pair=req.body.pair,type=req.body.type,assigned_no=req.body.assigned_no,order_id=req.body.order_id,purchased_quantity=req.body.purchased_quantity;
    
    console.log(quantity,price,mode);

    binance.exchangeInfo((err,data)=>{
        console.log(data.symbols)
        var filtered=Object.values(data.symbols);
    
        for(var i=0;i<filtered.length;i++){
            if(filtered[i].symbol==pair){
                sellingAsset=filtered[i].baseAsset;
                console.log(sellingAsset);
            }
        }
    
        if(mode=="sell"){
            binance.balance((error, balances) => {
                if ( error ) return console.error(error);
                // console.info("balances()", balances);
                Object.entries(balances).forEach(
                    ([key, value]) =>{
                        if(key==sellingAsset){
                            console.log(key, value.available)}
                            assetValue=value.available;
                        }
                );
              
                if(purchased_quantity-quantity>=0){
                    con.query('INSERT INTO cont SET ?',{assigned_no:assigned_no, price:price, quantity: quantity,mode:mode },function(error,entry){
                    if(error){
                      console.log(error);
                    }
                    else{
                      console.log(entry);
                    }
                  } 
                  );
                    res.redirect("/transaction/"+assigned_no+","+order_id+","+pair+","+type);
                } 
                else{
                    console.log("Cannot sell more than you have");
                    return;
                }        
            });
        }
        })

})


//----------------------------------- status of buy order and sell together------------------------------
app.get("/transaction/:info",(req,res)=>{

    let info=req.params.info;
    var arr=info.split(",");
    let type=arr[3];
    let pair=arr[2];
    let assigned_no=arr[0];
    let count;
    let orderid = arr[1];
    var a=[];
    console.log(info,type,assigned_no,orderid);

    con.query('SELECT COUNT(*) from cont ', function(error,results){
        if(error)
            console.log(err);
        else{    
            
            count=  Object.values(results[0])[0];
            console.log(count);
        }
    setInterval(()=>{

             
        binance.orderStatus(pair, orderid, (error, orderStatus, symbol) => {
            console.info(symbol+" order status:", orderStatus.status);
            if(orderStatus.status=="FILLED"){

                con.query("UPDATE trade SET orderStatus=? WHERE assigned_no=? AND orderId=? AND pair=?",["FILLED",assigned_no,orderid,pair],(err,res)=>{
                    if(err)
                        console.log(err);
                    console.log(res);
                

                con.query('SELECT trans_no,price, quantity from cont where assigned_no= ? AND orderId=?',[assigned_no,"NULL"],function(error,results){
                    if(error)
                        console.log(error);
                    else{
                        console.log(results.length);
                    }
                    
                    for(var i=0;i<results.length;i++){
                        
                        console.log(results[i].price,results[i].quantity,results[i].trans_no);
                        a.push(results[i].trans_no);
                        binance.sell(pair, results[i].quantity, results[i].price, {type:type}, (error, response) => {
                            console.info("Limit sell response", response);
                            console.info("order id: " + response.orderId);
                            
                            con.query('UPDATE cont SET orderId=? , orderStatus=? WHERE trans_no=? AND assigned_no=? AND orderId=?',[response.orderId,"PENDING",a[i],assigned_no,"NULL"],(err,results)=>{
                                if(err)
                                    console.log(err);
                                console.log(results);
                                return;
                            })


                          });
                    }
                })
                })
            }
            else{
                console.log("Status hasnt been fulfilled yet");
               
            }
        });
    },5000);  
    })
    
})

//----------------------------checking if sell requests are fulfilled---------------------
app.get("/sold",(req,res)=>{
    
    con.query('SELECT C.orderId,C.trans_no, T.pair from cont C,trade T WHERE C.orderStatus=? AND C.assigned_no=T.assigned_no  ',["PENDING"],function(err,results){
        if(err)
            console.log(err);
        
        console.log(typeof(results));
       
        for(var i=0;i<results.length;i++){
            
            binance.orderStatus("BNBUSDT",results[i].orderId,(err,orderStatus,symbol)=>{
                console.log(symbol+" order status: "+orderStatus.status);
            
            if(orderStatus.status=="FILLED"){
                con.query("UPDATE cont SET orderStatus=? WHERE orderId=? AND orderStatus=?",["FILLED",results[i].orderId,"PENDING"],(err,res)=>{
                    if(err)
                        console.log(err);
                    console.log(res);
                })
            }
            else
                console.log("order :",orderStatus.orderId," Not fulfilled");
            })
        }
        
        
    })

})





app.get("/cancel",(req,res)=>{
    let orderid="5037825";
    binance.cancel("BNBUSDT", orderid, (error, response, symbol) => {
        console.log(error);
        console.info(symbol+" cancel response:", response);
      });
    
})

app.get("/made",(req,res)=>{
    binance.allOrders("BNBUSDT", (error, orders, symbol) => {
        console.info(symbol+" orders:", orders);
        res.send(orders);
      });
})

app.get("/status",(req,res)=>{
    let orderid = "535130";
binance.orderStatus("BNBUSDT", orderid, (error, orderStatus, symbol) => {
  console.info(symbol+" order status:", orderStatus);
  res.send(orderStatus.status);
});
})

app.listen(5000,()=>{
    console.log("server has started on port 5000");
})

















