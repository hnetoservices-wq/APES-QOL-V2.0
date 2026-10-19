(() => {
  'use strict';
  const FEATURE = 'chatLinks';
  // Native IGM contains private, kingdom and Secret Society conversations.
  const ROOT = '.igmSystem';
  const LINK = 'a.qol-chat-link';
  const SKIP = 'a, script, style, textarea, input, select, button, code, pre, [role="textbox"], [contenteditable]:not([contenteditable="false"]), .igmConversationEntry, [id^="qol-"], [id^="apes-"]';
  const ADDRESS = /(?:https?:\/\/|www\.)[^\s<>"\u0000-\u001f]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"\u0000-\u001f]*)?/gi;
  // ICANN root-zone TLD labels extracted from the Mozilla Public Suffix List,
  // https://publicsuffix.org/list/public_suffix_list.dat (MPL 2.0).
  // Bundled at build time: no network requests, no chat content sent anywhere.
  // Bare domains require a recognized TLD; explicit http(s) URLs are exempt.
  const ROOT_TLDS = new Set(`
    aaa aarp abb abbott abbvie abc able abogado abudhabi ac academy accenture accountant accountants
    aco actor ad ads adult ae aeg aero aetna af afl africa ag agakhan
    agency ai aig airbus airforce airtel akdn al alibaba alipay allfinanz allstate ally alsace
    alstom am amazon americanexpress americanfamily amex amfam amica amsterdam analytics android anquan anz ao
    aol apartments app apple aq aquarelle ar arab aramco archi army arpa art arte
    as asda asia associates at athleta attorney au auction audi audible audio auspost author
    auto autos aw aws ax axa az azure ba baby baidu banamex band bank
    bar barcelona barclaycard barclays barefoot bargains baseball basketball bauhaus bayern bb bbc bbt bbva
    bcg bcn bd be beats beauty beer berlin best bestbuy bet bf bg bh
    bharti bi bible bid bike bing bingo bio biz bj black blackfriday blockbuster blog
    bloomberg blue bm bms bmw bn bnpparibas bo boats boehringer bofa bom bond boo
    book booking bosch bostik boston bot boutique box br bradesco bridgestone broadway broker brother
    brussels bs bt build builders business buy buzz bv bw by bz bzh ca
    cab cafe cal call calvinklein cam camera camp canon capetown capital capitalone car caravan
    cards care career careers cars casa case cash casino cat catering catholic cba cbn
    cbre cc cd center ceo cern cf cfa cfd cg ch chanel channel charity
    chase chat cheap chintai christmas chrome church ci cipriani circle cisco citadel citi citic
    city cl claims cleaning click clinic clinique clothing cloud club clubmed cm cn co
    coach codes coffee college cologne com commbank community company compare computer comsec condos construction
    consulting contact contractors cooking cool coop corsica country coupon coupons courses cpa cr credit
    creditcard creditunion cricket crown crs cruise cruises cu cuisinella cv cw cx cy cymru
    cyou cz dad dance data date dating datsun day dclk dds de deal dealer
    deals degree delivery dell deloitte delta democrat dental dentist desi design dev dhl diamonds
    diet digital direct directory discount discover dish diy dj dk dm dnp do docs
    doctor dog domains dot download drive dtv dubai dupont durban dvag dvr dz earth
    eat ec eco edeka edu education ee eg email emerck energy engineer engineering enterprises
    epson equipment ericsson erni es esq estate et eu eurovision eus events exchange expert
    exposed express extraspace fage fail fairwinds faith family fan fans farm farmers fashion fast
    fedex feedback ferrari ferrero fi fidelity fido film final finance financial fire firestone firmdale
    fish fishing fit fitness fj flickr flights flir florist flowers fly fm fo foo
    food football ford forex forsale forum foundation fox fr free fresenius frl frogans frontier
    ftr fujitsu fun fund furniture futbol fyi ga gal gallery gallo gallup game games
    gap garden gay gb gbiz gd gdn ge gea gent genting george gf gg
    ggee gh gi gift gifts gives giving gl glass gle global globo gm gmail
    gmbh gmo gmx gn godaddy gold goldpoint golf goodyear goog google gop got gov
    gp gq gr grainger graphics gratis green gripe grocery group gs gt gu gucci
    guge guide guitars guru gw gy hair hamburg hangout haus hbo hdfc hdfcbank health
    healthcare help helsinki here hermes hiphop hisamitsu hitachi hiv hk hkt hm hn hockey
    holdings holiday homedepot homegoods homes homesense honda horse hospital host hosting hot hotel hotels
    hotmail house how hr hsbc ht hu hughes hyatt hyundai ibm icbc ice icu
    id ie ieee ifm ikano il im imamat imdb immo immobilien in inc industries
    infiniti info ing ink institute insurance insure int international intuit investments io ipiranga iq
    ir irish is ismaili ist istanbul it itau itv jaguar java jcb je jeep
    jetzt jewelry jio jll jmp jnj jo jobs joburg jot joy jp jpmorgan jprs
    juegos kaufen kddi ke kerryhotels kerryproperties kfh kg kh ki kia kids kim kindle
    kitchen kiwi km kn koeln komatsu kosher kp kpmg kpn kr krd kred kuokgroup
    kw ky kyoto kz la lacaixa lamborghini lamer land landrover lanxess lasalle lat latino
    latrobe law lawyer lb lc lds lease leclerc lefrak legal lego lexus lgbt li
    lidl life lifeinsurance lifestyle lighting like lilly limited limo lincoln link live living lk
    llc llp loan loans locker locus lol london lotte lotto love lpl lplfinancial lr
    ls lt ltd ltda lu lundbeck luxe luxury lv ly ma madrid maif maison
    makeup man management mango map market marketing markets marriott marshalls mattel mba mc mckinsey
    md me med media meet melbourne meme memorial men menu merck merckmsd mg mh
    miami microsoft mil mini mint mit mitsubishi mk ml mlb mls mma mn mo
    mobi mobile moda moe moi mom monash money monster mormon mortgage moscow moto motorcycles
    mov movie mp mq mr ms msd mt mtn mtr mu museum music mv
    mw mx my mz na nab nagoya name navy nba nc ne nec net
    netbank netflix network neustar new news next nextdirect nexus nf nfl ng ngo nhk
    ni nico nike nikon ninja nissan nissay nl no nokia norton now nowruz nowtv
    nr nra nrw ntt nu nyc nz obi observer office okinawa olayan olayangroup ollo
    om omega one ong onion onl online ooo open oracle orange org organic origins
    osaka otsuka ott ovh pa page panasonic paris pars partners parts party pay pccw
    pe pet pf pfizer ph pharmacy phd philips phone photo photography photos physio pics
    pictet pictures pid pin ping pink pioneer pizza pk pl place play playstation plumbing
    plus pm pn pnc pohl poker politie porn post pr praxi press prime pro
    prod productions prof progressive promo properties property protection pru prudential ps pt pub pw
    pwc py qa qpon quebec quest racing radio re read realestate realtor realty recipes
    red redumbrella rehab reise reisen reit reliance ren rent rentals repair report republican rest
    restaurant review reviews rexroth rich richardli ricoh ril rio rip ro rocks rodeo rogers
    room rs rsvp ru rugby ruhr run rw rwe ryukyu sa saarland safe safety
    sakura sale salon samsclub samsung sandvik sandvikcoromant sanofi sap sarl sas save saxo sb
    sbi sbs sc scb schaeffler schmidt scholarships school schule schwarz science scot sd se
    search seat secure security seek select sener services seven sew sex sexy sfr sg
    sh shangrila sharp shell shia shiksha shoes shop shopping shouji show si silk sina
    singles site sj sk ski skin sky skype sl sling sm smart smile sn
    sncf so soccer social softbank software sohu solar solutions song sony soy spa space
    sport spot sr srl ss st stada staples star statebank statefarm stc stcgroup stockholm
    storage store stream studio study style su sucks supplies supply support surf surgery suzuki
    sv swatch swiss sx sy sydney systems sz tab taipei talk taobao target tatamotors
    tatar tattoo tax taxi tc tci td tdk team tech technology tel temasek tennis
    teva tf tg th thd theater theatre tiaa tickets tienda tips tires tirol tj
    tjmaxx tjx tk tkmaxx tl tm tmall tn to today tokyo tools top toray
    toshiba total tours town toyota toys tr trade trading training travel travelers travelersinsurance trust
    trv tt tube tui tunes tushu tv tvs tw tz ua ubank ubs ug
    uk unicom university uno uol ups us uy uz va vacations vana vanguard vc
    ve vegas ventures verisign versicherung vet vg vi viajes video vig viking villas vin
    vip virgin visa vision viva vivo vlaanderen vn vodka volvo vote voting voto voyage
    vu wales walmart walter wang wanggou watch watches weather weatherchannel web webcam weber website
    wed wedding weibo weir wf whoswho wien wiki williamhill win windows wine winners wme
    woodside work works world wow ws wtc wtf xbox xerox xihuan xin xxx xyz
    yachts yahoo yamaxun yandex ye yodobashi yoga yokohama you youtube yt yun zappos zara
    zero zip zm zone zuerich zw
  `.trim().split(/\s+/));
  let observer = null;
  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE);

  function trimAddress(value) {
    let result = value.replace(/[.,!?;:'’”]+$/, '');
    const pairs = { ')': '(', ']': '[', '}': '{' };
    while (pairs[result.at(-1)]) {
      const closing = result.at(-1), opening = pairs[closing];
      if ([...result].filter(char => char === closing).length <= [...result].filter(char => char === opening).length) break;
      result = result.slice(0, -1).replace(/[.,!?;:'’”]+$/, '');
    }
    return result;
  }
  function linkText(node) {
    const parent = node.parentElement;
    if (!parent?.closest(ROOT) || parent.closest(SKIP)) return;
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let end = 0, found = false;
    ADDRESS.lastIndex = 0;
    for (const match of text.matchAll(ADDRESS)) {
      // Avoid email addresses, fragments of words and unsupported schemes.
      if (match.index && /[\p{L}\p{N}_@./-]/u.test(text[match.index - 1])) continue;
      const label = trimAddress(match[0]);
      let url;
      try { url = new URL(/^https?:\/\//i.test(label) ? label : `https://${label}`); } catch (_) { continue; }
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;
      // URL() accepts arbitrary-looking hostnames; that alone doesn't make
      // a name such as N.apoleon a website. For scheme-less addresses, require
      // a recognized public top-level domain (including country-code TLDs).
      if (!/^https?:\/\//i.test(label)) {
        const suffix = url.hostname.toLowerCase().split('.').at(-1);
        if (!ROOT_TLDS.has(suffix)) continue;
      }
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      const anchor = document.createElement('a');
      anchor.className = 'qol-chat-link'; anchor.textContent = label; anchor.href = url.href;
      anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      fragment.append(anchor);
      end = match.index + label.length; found = true;
    }
    if (!found) return;
    fragment.append(document.createTextNode(text.slice(end)));
    node.replaceWith(fragment);
  }
  function process(root) {
    if (!root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) { linkText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;
    if (!root.closest(ROOT) && !root.querySelector(ROOT)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(linkText);
  }
  function sync() {
    observer?.disconnect(); observer = null;
    if (!enabled()) {
      document.querySelectorAll(LINK).forEach(anchor => anchor.replaceWith(document.createTextNode(anchor.textContent)));
      return;
    }
    document.querySelectorAll(ROOT).forEach(process);
    observer = new MutationObserver(records => {
      if (!enabled()) { sync(); return; }
      // Observe game updates only; suppress mutations produced by our links.
      observer.disconnect();
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'characterData') roots.add(record.target);
        else record.addedNodes.forEach(node => roots.add(node));
      }
      roots.forEach(process);
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  // Keep the browser's native link activation, while preventing the game's
  // conversation click handlers from swallowing it or opening the reply editor.
  for (const type of ['click', 'auxclick']) document.addEventListener(type, event => {
    if (enabled() && event.target.closest?.(LINK)) event.stopPropagation();
  }, true);
  window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE) sync(); });
  if (document.body) sync(); else document.addEventListener('DOMContentLoaded', sync, { once: true });
})();
