const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../src/main/resources/static/assets/js/products.js'),'utf8');
const html = fs.readFileSync(path.join(__dirname,'../src/main/resources/static/pages/products.html'),'utf8');
const settle = async () => { for (let index=0;index<4;index++) await new Promise(setImmediate); };
const product = (id, price, category='Cake', extra={}) => ({_id:String(id).padStart(24,'0'),name:`Cake ${id}`,price,category,status:'active',stock:3,images:['/assets/images/cake1.png'],...extra});
const response = (products, pagination={total:products.length,page:1,pages:1},status=200) => ({ok:status<400,status,json:async()=>({products,pagination,message:'Fixture server error'})});

async function screen({loggedIn=true,handler}={}) {
    const nodes=new Map(),requests=[],events=new Map(),timers=new Map();let initialize,timerId=0;
    const get=key=>{
        if(!nodes.has(key)) {
            const classes=new Set();
            nodes.set(key,{value:'',innerHTML:'',textContent:'',disabled:false,hidden:false,listeners:{},attributes:{},
                classList:{toggle(key,value){if(value)classes.add(key);else classes.delete(key);},contains:key=>classes.has(key)},
                setAttribute(key,value){this.attributes[key]=value;},addEventListener(name,fn){this.listeners[name]=fn;},
                reportValidity:()=>true,checkValidity:()=>true});
        }
        return nodes.get(key);
    };
    get('products-sort').value='default';
    get('[data-product-filters]').reset=()=>{get('products-min-price').value='';get('products-max-price').value='';get('products-sort').value='default';};
    const context=vm.createContext({
        window:{SugarBlissApi:{baseUrl:'http://localhost:3000'},addEventListener(name,fn){events.set(name,fn);},
            setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearTimeout(id){timers.delete(id);}},
        document:{querySelector:get,getElementById:get,addEventListener(name,fn){initialize=fn;}},
        localStorage:{getItem:()=>loggedIn?'fixture-token':null},URLSearchParams,
        fetch:async(url,init)=>{
            const request={query:Object.fromEntries(new URL(url).searchParams),headers:init.headers};requests.push(request);
            if(handler){const result=await handler(request);if(result!==undefined)return result;}
            return response([product(1,100000,'Cookies'),product(2,200000,'Cake')]);
        },console,
    });
    vm.runInContext(source,context);initialize();await settle();
    return {get,context,requests,events,timers,
        async apply(min='',max='',sort='default'){get('products-min-price').value=min;get('products-max-price').value=max;get('products-sort').value=sort;get('[data-product-filters]').listeners.submit({preventDefault(){}});await settle();},
        async sort(value){get('products-sort').value=value;get('products-sort').listeners.change();await settle();},
        async clear(){get('[data-clear-product-filters]').listeners.click();await settle();},
        input(id,value){get(id).value=value;get(id).listeners.input();},
        async flushInputs(){const scheduled=[...timers.values()];timers.clear();scheduled.forEach(timer=>timer.fn());await settle();},
        async category(value){get('[data-category-list]').listeners.click({target:{closest:()=>({disabled:false,dataset:{productCategory:value}})}});await settle();},
    };
}

test('initial products stay grouped with no price bounds and requests carry the customer token',async()=>{
    const view=await screen();assert.deepEqual(view.requests[0].query,{status:'all',limit:'100',page:'1',sort:'default'});
    assert.equal(view.requests[0].headers.Authorization,'Bearer fixture-token');assert.match(view.get('[data-products-container]').innerHTML,/category-section/);
    assert.equal(view.get('[data-products-result-count]').textContent,'2 products');
    assert.equal(view.get('[data-products-more]').hidden,true);
});
test('all price controls and the result count are inside the left category sidebar',()=>{
    const sidebar=html.match(/<aside class="products-sidebar">([\s\S]*?)<\/aside>/)[1];
    for(const marker of ['products-min-price','products-max-price','products-sort','products-filter-apply','data-clear-product-filters','data-products-result-count','data-category-list']) assert.ok(sidebar.includes(marker),marker);
    assert.equal((html.match(/class="products-controls"/g)||[]).length,1);
});
test('price Apply submits optional inclusive bounds, supports exact zero and normalizes scientific input',async()=>{
    const view=await screen();await view.apply('100000','300000');assert.equal(view.requests.at(-1).query.minPrice,'100000');assert.equal(view.requests.at(-1).query.maxPrice,'300000');
    await view.apply('0','0');assert.equal(view.requests.at(-1).query.minPrice,'0');assert.equal(view.requests.at(-1).query.maxPrice,'0');
    await view.apply('','1e5');assert.equal(view.requests.at(-1).query.minPrice,undefined);assert.equal(view.requests.at(-1).query.maxPrice,'100000');
});
test('invalid range or numeric amounts do not replace results or call the API',async()=>{
    const view=await screen();const content=view.get('[data-products-container]').innerHTML;
    for(const[min,max]of[['200000','100000'],['-1',''],['','1.5'],['no',''],['9007199254740992','']])await view.apply(min,max);
    assert.equal(view.requests.length,1);assert.equal(view.get('[data-products-container]').innerHTML,content);
    assert.equal(view.get('[data-product-filter-error]').hidden,false);
    view.get('[data-product-filters]').reportValidity=()=>false;await view.apply('1','2');assert.equal(view.requests.length,1);
});
test('price sort preserves global API order across categories and keeps sold-out products disabled',async()=>{
    const view=await screen({handler:request=>request.query.sort==='price_asc'?response([product(2,50000,'Cake'),product(1,100000,'Cookies',{stock:0})]):request.query.sort==='price_desc'?response([product(1,100000,'Cookies'),product(2,50000,'Cake')]):undefined});
    await view.sort('price_asc');let html=view.get('[data-products-container]').innerHTML;
    assert.doesNotMatch(html,/category-section/);assert.ok(html.indexOf('Cake 2')<html.indexOf('Cake 1'));assert.equal(view.get('.products-sidebar').hidden,false);
    assert.equal(view.get('[data-category-list]').hidden,false);assert.equal(view.get('[data-product-filters]').hidden,false);
    assert.match(html,/product-card is-unavailable/);assert.equal((html.match(/ disabled/g)||[]).length,3);
    await view.sort('price_desc');html=view.get('[data-products-container]').innerHTML;assert.ok(html.indexOf('Cake 1')<html.indexOf('Cake 2'));
});
test('Clear removes price bounds and sorting, restores categories and clears errors',async()=>{
    const view=await screen();await view.apply('100000','300000','price_desc');await view.clear();
    assert.deepEqual(view.requests.at(-1).query,{status:'all',limit:'100',page:'1',sort:'default'});
    assert.equal(view.get('.products-sidebar').hidden,false);assert.equal(view.get('products-min-price').value,'');
    assert.equal(view.get('[data-category-list]').hidden,false);
    assert.equal(view.get('[data-product-filter-error]').hidden,true);assert.match(view.get('[data-products-container]').innerHTML,/category-section/);
});
test('a stale slower response cannot overwrite the latest price sort or result count',async()=>{
    let finish;
    const view=await screen({handler:request=>request.query.sort==='price_asc'?new Promise(resolve=>{finish=resolve;}):request.query.sort==='price_desc'?response([product(9,900000)]):undefined});
    await view.sort('price_asc');await view.sort('price_desc');finish(response([product(1,100000),product(2,200000)]));await settle();
    assert.match(view.get('[data-products-container]').innerHTML,/Cake 9/);assert.doesNotMatch(view.get('[data-products-container]').innerHTML,/Cake 1/);
    assert.equal(view.get('[data-products-result-count]').textContent,'1 product');assert.equal(view.get('[data-products-container]').attributes['aria-busy'],'false');
});
test('Load more appends the next filtered/sorted page once and keeps the real total',async()=>{
    let finish;const products=Array.from({length:101},(_,index)=>product(index+1,100000+index));
    const view=await screen({handler:request=>request.query.page==='2'?new Promise(resolve=>{finish=resolve;}):response(products.slice(0,100),{total:101,page:1,pages:2})});
    await view.apply('100000','200000','price_asc');assert.equal(view.get('[data-products-more]').hidden,false);
    const pending=view.context.fetchProducts(true);await view.context.fetchProducts(true);
    assert.equal(view.requests.filter(request=>request.query.page==='2').length,1);assert.equal(view.get('[data-products-more]').disabled,true);
    assert.equal(view.requests.at(-1).query.minPrice,'100000');assert.equal(view.requests.at(-1).query.sort,'price_asc');
    finish(response(products.slice(100),{total:101,page:2,pages:2}));await pending;
    assert.equal((view.get('[data-products-container]').innerHTML.match(/class="product-card/g)||[]).length,101);
    assert.equal(view.get('[data-products-result-count]').textContent,'101 products');assert.equal(view.get('[data-products-more]').hidden,true);
});
test('errors offer retry, a failed next page keeps current products and empty filtered results are explicit',async()=>{
    let failed=true;
    const view=await screen({handler:request=>failed?response([],{total:0,pages:0},500):response([],{total:0,pages:0})});
    assert.match(view.get('[data-products-container]').innerHTML,/data-retry-products/);assert.doesNotMatch(view.get('[data-products-container]').innerHTML,/href="\/login"/);
    failed=false;await view.apply('999999','');assert.match(view.get('[data-products-container]').innerHTML,/No products match these filters/);assert.equal(view.get('[data-products-result-count]').textContent,'0 products');
    const paging=await screen({handler:request=>request.query.page==='2'?response([],{total:101,pages:2},500):response([product(1,100000)],{total:101,page:1,pages:2})});
    await paging.context.fetchProducts(true);assert.match(paging.get('[data-products-container]').innerHTML,/Cake 1/);
    assert.equal(paging.get('[data-products-more]').disabled,false);assert.equal(paging.get('[data-product-filter-error]').hidden,false);
});
test('changing filters discards an in-flight next page and language changes preserve the applied filters',async()=>{
    let finish;
    const view=await screen({handler:request=>request.query.page==='2'?new Promise(resolve=>{finish=resolve;}):request.query.sort==='price_desc'?response([product(8,800000)]):response([product(1,100000)],{total:101,page:1,pages:2})});
    const pending=view.context.fetchProducts(true);await view.apply('200000','900000','price_desc');finish(response([product(2,120000)],{total:101,page:2,pages:2}));await pending;
    assert.match(view.get('[data-products-container]').innerHTML,/Cake 8/);assert.doesNotMatch(view.get('[data-products-container]').innerHTML,/Cake 2/);
    view.events.get('sugarbliss:lang-changed')();await settle();assert.deepEqual(view.requests.at(-1).query,{status:'all',limit:'100',page:'1',sort:'price_desc',minPrice:'200000',maxPrice:'900000'});
});
test('anonymous catalog does not query the API and retains the login prompt',async()=>{
    const view=await screen({loggedIn:false});assert.equal(view.requests.length,0);assert.match(view.get('[data-products-container]').innerHTML,/Please log in/);
});

test('typing either price automatically fetches only once after the debounce using both current bounds',async()=>{
    const view=await screen();view.input('products-min-price','1');view.input('products-min-price','100000');view.input('products-max-price','300000');
    assert.equal(view.requests.length,1);assert.equal(view.timers.size,1);assert.equal([...view.timers.values()][0].delay,350);
    await view.flushInputs();assert.equal(view.requests.length,2);assert.equal(view.requests.at(-1).query.minPrice,'100000');assert.equal(view.requests.at(-1).query.maxPrice,'300000');
    view.input('products-max-price','');await view.flushInputs();assert.equal(view.requests.at(-1).query.maxPrice,undefined);
});

test('automatic price filtering never opens native validation or fetches invalid input',async()=>{
    const view=await screen();let nativePrompts=0;
    view.get('[data-product-filters]').reportValidity=()=>{nativePrompts++;return true;};
    view.input('products-min-price','200000');view.input('products-max-price','100000');await view.flushInputs();
    assert.equal(view.requests.length,1);assert.equal(nativePrompts,0);assert.equal(view.get('[data-product-filter-error]').hidden,false);
    view.get('[data-product-filters]').checkValidity=()=>false;view.input('products-min-price','-1');await view.flushInputs();assert.equal(view.requests.length,1);
});

test('sort or explicit Apply flushes pending price input and Clear cancels stale automatic requests',async()=>{
    const view=await screen();view.input('products-min-price','100000');await view.sort('price_desc');await view.flushInputs();
    assert.equal(view.requests.length,2);assert.equal(view.requests.at(-1).query.minPrice,'100000');
    view.input('products-max-price','300000');await view.apply('100000','300000','price_desc');await view.flushInputs();assert.equal(view.requests.length,3);
    view.input('products-min-price','200000');await view.clear();await view.flushInputs();assert.equal(view.requests.length,4);assert.equal(view.requests.at(-1).query.minPrice,undefined);
});

test('categories call the API, stay available for empty/sorted results and preserve price/sort on category changes',async()=>{
    const view=await screen({handler:request=>({ok:true,status:200,json:async()=>({
        products:request.query.category==='Cake'?[product(2,200000,'Cake')]:request.query.category==='Cookies'?[]:[product(1,100000,'Cookies'),product(2,200000,'Cake')],
        categories:['Cookies','Cake','Macaroons'],pagination:{total:request.query.category==='Cookies'?0:request.query.category==='Cake'?1:2,page:1,pages:1},
    })})});
    await view.apply('150000','300000','price_desc');await view.category('Cake');
    assert.deepEqual(view.requests.at(-1).query,{status:'all',limit:'100',page:'1',sort:'price_desc',minPrice:'150000',maxPrice:'300000',category:'Cake'});
    assert.match(view.get('[data-category-list]').innerHTML,/data-product-category="Cake" aria-pressed="true"/);
    assert.match(view.get('[data-category-list]').innerHTML,/data-product-category="Macaroons"/);assert.equal(view.get('[data-category-list]').hidden,false);
    await view.category('Cookies');assert.match(view.get('[data-products-container]').innerHTML,/No products match these filters/);
    assert.match(view.get('[data-category-list]').innerHTML,/data-product-category="Cake"/);
    await view.category('');assert.equal(view.requests.at(-1).query.category,undefined);assert.equal(view.requests.at(-1).query.minPrice,'150000');
    await view.category('Cake');await view.clear();assert.equal(view.requests.at(-1).query.category,undefined);
});

test('load-more and language changes keep the selected category and reset page only when filters change',async()=>{
    const view=await screen({handler:request=>response([product(request.query.page==='2'?2:1,100000)],{total:101,page:Number(request.query.page),pages:2})});
    await view.category('Cake');await view.context.fetchProducts(true);assert.equal(view.requests.at(-1).query.category,'Cake');assert.equal(view.requests.at(-1).query.page,'2');
    view.events.get('sugarbliss:lang-changed')();await settle();assert.equal(view.requests.at(-1).query.category,'Cake');assert.equal(view.requests.at(-1).query.page,'1');
});

test('unsafe category names are escaped and literal prototype-key categories cannot crash rendering',async()=>{
    const view=await screen({handler:()=>({ok:true,status:200,json:async()=>({products:[product(1,100000,'__proto__')],categories:['__proto__','<script>cake</script>'],pagination:{total:1,pages:1}})})});
    assert.match(view.get('[data-products-container]').innerHTML,/__proto__/);assert.doesNotMatch(view.get('[data-category-list]').innerHTML,/<script>/);
    assert.match(view.get('[data-category-list]').innerHTML,/&lt;script&gt;cake&lt;\/script&gt;/);
});
