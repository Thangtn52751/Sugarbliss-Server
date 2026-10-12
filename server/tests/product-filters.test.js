const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Product = require('../models/Product');
const auth = require('../middleware/authMiddleware');
const protect = auth.protect;
auth.protect = (req, res, next) => req.headers.authorization ? next() : res.status(401).json({ message: 'Sign in.' });
const routes = require('../routes/productRoutes');
auth.protect = protect;
let server, base, data, captured;
function matches(product, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === '$or') return expected.some(part => matches(product, part));
        if (expected instanceof RegExp) return expected.test(product[key]);
        if (typeof expected === 'object') return Object.entries(expected).every(([op, value]) => op === '$gte' ? product[key] >= value : product[key] <= value);
        return product[key] === expected;
    });
}
function query(rows) {
    return { select(value) { assert.equal(value, '-reviews'); return this; },
        sort(order) { captured.sort = order; rows.sort((a,b) => { for (const [key,direction] of Object.entries(order)) {
            if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * direction;
        } return 0; }); return this; },
        skip(value) { rows = rows.slice(value); return this; }, limit(value) { rows = rows.slice(0,value); return this; },
        then(resolve,reject) { return Promise.resolve(rows).then(resolve,reject); } };
}
async function call(query = '', authenticated = true) {
    const response = await fetch(base + (query ? '?' + query : ''), { headers: authenticated ? { Authorization: 'Bearer fixture' } : {} });
    return { status: response.status, data: await response.json() };
}
before(async () => {
    const app = express(); app.use('/api/products', routes);
    app.use((error,req,res,next) => res.status(error.statusCode || 500).json({message:error.message,code:error.code}));
    await new Promise(resolve => { server=app.listen(0,'127.0.0.1',resolve); }); base=`http://127.0.0.1:${server.address().port}/api/products`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
    data = [
        {name:'Chocolate Cake',category:'Cake',price:300000,featured:false},
        {name:'Berry Cookies',category:'Cookies',price:100000,featured:false},
        {name:'Macaroon Box',category:'Macaroons',price:200000,featured:false},
        {name:'Featured Cupcake',category:'Cake',price:200000,featured:true},
        {name:'Free Sample',category:'Cake',price:0,featured:false},
        {name:'Sold-out Cake',category:'Cake',price:150000,status:'out-of-stock',featured:false},
        {name:'Inactive Cake',category:'Cake',price:250000,status:'inactive',featured:false},
    ].map((product,index)=>({_id:String(index+1).padStart(24,'0'),status:'active',description:'Fresh dessert',createdAt:index,...product}));
    captured={};
    mock.method(Product,'find',filter=>{captured.filter=filter;return query(data.filter(product=>matches(product,filter)));});
    mock.method(Product,'countDocuments',async filter=>{captured.countFilter=filter;return data.filter(product=>matches(product,filter)).length;});
    mock.method(Product,'distinct',async (field,filter)=>{assert.equal(field,'category');captured.categoryFilter=filter;return [...new Set(data.filter(product=>matches(product,filter)).map(product=>product.category))];});
});
afterEach(()=>mock.restoreAll());

test('price filtering remains protected by login',async()=>{
    assert.equal((await call('minPrice=100000',false)).status,401);assert.equal(Product.find.mock.callCount(),0);
});
test('default catalog behavior and category/search/featured filters remain compatible',async()=>{
    const response=await call();assert.equal(response.status,200);assert.equal(response.data.products[0].name,'Featured Cupcake');
    assert.ok(response.data.products.every(product=>product.status==='active'));
    const filtered=await call('category=Cake&featured=true&search=Cupcake');assert.equal(filtered.data.pagination.total,1);
    assert.equal(filtered.data.products[0].name,'Featured Cupcake');
});
test('price ranges are inclusive, combine with other filters and return the filtered total',async()=>{
    const response=await call('status=all&minPrice=100000&maxPrice=200000&sort=price_asc');
    assert.equal(response.status,200);assert.deepEqual(response.data.products.map(product=>product.price),[100000,150000,200000,200000]);
    assert.equal(response.data.pagination.total,4);assert.deepEqual(captured.filter.price,{$gte:100000,$lte:200000});
    assert.deepEqual(captured.countFilter,captured.filter);
    const cake=await call('status=all&category=Cake&minPrice=100000&maxPrice=200000');assert.equal(cake.data.pagination.total,2);
});
test('open-ended ranges and an exact zero or exact price are accepted',async()=>{
    assert.deepEqual((await call('minPrice=200000&sort=price_asc')).data.products.map(product=>product.price),[200000,200000,300000]);
    assert.deepEqual((await call('maxPrice=100000&sort=price_desc')).data.products.map(product=>product.price),[100000,0]);
    assert.deepEqual((await call('minPrice=0&maxPrice=0')).data.products.map(product=>product.price),[0]);
    assert.equal((await call('minPrice=200000&maxPrice=200000')).data.pagination.total,2);
});
test('price order is global across categories, ignores featured priority and has a stable tie-breaker',async()=>{
    const ascending=await call('status=all&sort=price_asc');assert.deepEqual(ascending.data.products.map(product=>product.price),[0,100000,150000,200000,200000,250000,300000]);
    assert.deepEqual(captured.sort,{price:1,_id:1});
    const descending=await call('status=all&sort=price_desc');assert.deepEqual(descending.data.products.map(product=>product.price),[300000,250000,200000,200000,150000,100000,0]);
    assert.deepEqual(captured.sort,{price:-1,_id:1});
    assert.deepEqual(descending.data.products.filter(product=>product.price===200000).map(product=>product._id),[data[2]._id,data[3]._id]);
});
test('database filtering/sorting happen before pagination instead of sorting the first page locally',async()=>{
    const page1=await call('status=all&sort=price_desc&limit=2&page=1');const page2=await call('status=all&sort=price_desc&limit=2&page=2');
    assert.deepEqual(page1.data.products.map(product=>product.price),[300000,250000]);assert.deepEqual(page2.data.products.map(product=>product.price),[200000,200000]);
    assert.deepEqual(page2.data.pagination,{total:7,page:2,limit:2,pages:4});
});
test('invalid ranges, fractional/negative prices, repeated parameters and unsafe sort values fail before querying',async()=>{
    for (const query of ['minPrice=-1','maxPrice=1.5','minPrice=no','maxPrice=Infinity','minPrice=9007199254740992',
        'minPrice=2&maxPrice=1','minPrice=1&minPrice=2','maxPrice=1&maxPrice=2','sort=unknown','sort=__proto__','sort=price_asc&sort=price_desc','category=Cake&category=Cookies']) {
        const response=await call(query);assert.equal(response.status,400,query);assert.equal(response.data.code,'PRODUCT_FILTER_INVALID');
    }
    assert.equal(Product.find.mock.callCount(),0);
});

test('category filtering combines with price/sort and returns a stable full category menu independent of page and price',async()=>{
    const result=await call('status=all&category=Cake&minPrice=100000&maxPrice=300000&sort=price_desc&limit=1');
    assert.equal(result.status,200);assert.equal(result.data.products[0].name,'Chocolate Cake');assert.equal(result.data.pagination.total,4);
    assert.deepEqual(result.data.categories,['Cake','Cookies','Macaroons']);assert.deepEqual(captured.categoryFilter,{});
    const empty=await call('status=all&category=Cookies&minPrice=999999');assert.equal(empty.data.products.length,0);
    assert.deepEqual(empty.data.categories,['Cake','Cookies','Macaroons']);
    const nonexistent=await call('status=all&category=Unknown');assert.equal(nonexistent.data.pagination.total,0);
    assert.deepEqual(nonexistent.data.categories,['Cake','Cookies','Macaroons']);
});
test('page and limit are validated, large page offsets are rejected and limit remains capped',async()=>{
    for (const query of ['page=0','page=bad','page=1.5','limit=-1','limit=0','page=1&page=2','page=9007199254740991&limit=100']) assert.equal((await call(query)).status,400,query);
    assert.equal((await call('limit=1000')).data.pagination.limit,100);
});
test('empty ranges return a real empty result and literal search terms remain escaped',async()=>{
    const empty=await call('minPrice=999999');assert.deepEqual(empty.data.products,[]);assert.equal(empty.data.pagination.total,0);
    await call('search=cake%2B%28x%29&minPrice=0');assert.equal(captured.filter.$or[0].name.source,'cake\\+\\(x\\)');
});
