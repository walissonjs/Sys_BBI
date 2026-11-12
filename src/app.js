

const R = 6378137, rad = d => d * Math.PI / 180, $ = id => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const num = s => { s = String(s || "").replace(/[^\d,.-]/g, ""); if (!s) return NaN; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, ""); return parseFloat(s) };
const msg = t => $("msg").textContent = t, V = k => (document.querySelector(`[data-k=${k}]`).value || "").trim();

/* ---------- geometria ---------- */
const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++) { const [a, b] = r[i], [c, d] = r[(i + 1) % r.length]; s += rad(c - a) * (2 + Math.sin(rad(b)) + Math.sin(rad(d))) } return Math.abs(s * R * R / 2) };
const segLen = (p, q) => { const a = Math.sin(rad(q[1] - p[1]) / 2) ** 2 + Math.cos(rad(p[1])) * Math.cos(rad(q[1])) * Math.sin(rad(q[0] - p[0]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)) };
const coords = t => t.trim().split(/\s+/).map(s => s.split(",").map(Number)).filter(p => p.length >= 2 && !p.some(isNaN)).map(p => [p[0], p[1]]);
const open = r => { const f = r[0], l = r[r.length - 1]; return r.length > 1 && f[0] === l[0] && f[1] === l[1] ? r.slice(0, -1) : r };

function parseKML(t) {
    const d = new DOMParser().parseFromString(t, "application/xml"); if (d.querySelector("parsererror")) throw new Error("KML inválido."); const out = [];
    d.querySelectorAll("Placemark").forEach(pm => {
        const nm = (pm.querySelector(":scope > name")?.textContent || "").trim();
        pm.querySelectorAll("Polygon").forEach(pg => {
            const o = pg.querySelector("outerBoundaryIs coordinates"); if (!o) return; const ring = open(coords(o.textContent)); if (ring.length < 3) return;
            const holes = [...pg.querySelectorAll("innerBoundaryIs coordinates")].map(c => open(coords(c.textContent)));
            out.push({ name: nm || "Polígono " + (out.length + 1), ring, holes, area: ringArea(ring) - holes.reduce((a, h) => a + ringArea(h), 0) })
        })
    });
    return out
}
async function readFile(f) { if (/\.kml$/i.test(f.name)) return f.text(); const z = await JSZip.loadAsync(f), e = z.file(/\.kml$/i)[0]; if (!e) throw new Error("Nenhum .kml dentro do KMZ."); return e.async("string") }

/* ---------- mapa de conferência e áreas ---------- */
const map = L.map("map").setView([-14, -52], 4);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagem © Esri, Maxar, Earthstar Geographics | Dados © OpenStreetMap" }).addTo(map);
const layer = L.featureGroup().addTo(map), poiLayer = L.layerGroup().addTo(map); let areas = [];
const incl = () => areas.filter(a => a.on), total = () => incl().reduce((t, a) => t + a.m2, 0);

function draw(fit) {
    layer.clearLayers(); const ll = r => r.map(p => [p[1], p[0]]);
    incl().filter(a => a.poly).forEach(a => L.polygon([ll(a.poly.ring), ...a.poly.holes.map(ll)], { color: "#ffe600", weight: 3, fillColor: "#ffe600", fillOpacity: .2 }).addTo(layer));
    if (fit && layer.getLayers().length) map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 18 });
    $("m2").innerHTML = fmt(total(), 2) + " <small>m² (total das áreas marcadas)</small>"; $("ha").textContent = fmt(total() / 1e4, 4) + " ha"; $("res").style.display = "block"
}

function renderAreas() {
    $("areas").innerHTML = ""; areas.forEach(a => {
        const d = document.createElement("div"); d.className = "ar";
        d.innerHTML = `<input type="checkbox" title="Incluir"${a.on ? " checked" : ""}><input value="${String(a.name).replace(/"/g, "&quot;")}"><input value="${fmt(a.m2, 2)}" inputmode="decimal"${a.poly ? " readonly" : ""}>`;
        const [c, n, m] = d.querySelectorAll("input"); c.onchange = () => { a.on = c.checked; draw(true) }; n.oninput = () => a.name = n.value;
        m.onchange = () => { const v = num(m.value); if (v >= 0) { a.m2 = v; m.value = fmt(v, 2); draw(false) } }; $("areas").appendChild(d)
    })
}
async function handle(f) {
    msg(""); try {
        const p = parseKML(await readFile(f)); if (!p.length) throw new Error("Nenhum polígono encontrado no arquivo.");
        areas = p.map(q => ({ name: q.name, m2: q.area, poly: q, on: true })); renderAreas(); draw(true)
    } catch (e) { msg(e.message) }
}
$("addArea").onclick = () => { areas.push({ name: "Outra área", m2: 0, poly: null, on: true }); renderAreas(); draw(false) };
const drop = $("drop"), inp = $("file"); drop.onclick = () => inp.click(); inp.onchange = () => inp.files[0] && handle(inp.files[0]);
["dragover", "dragenter"].forEach(v => drop.addEventListener(v, e => { e.preventDefault(); drop.classList.add("over") }));
["dragleave", "drop"].forEach(v => drop.addEventListener(v, e => { e.preventDefault(); drop.classList.remove("over") }));
drop.addEventListener("drop", e => e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]));

/* ---------- imagem do terreno (satélite + dados do OpenStreetMap) ---------- */
const TS = 256, mx = (o, z) => (o + 180) / 360 * TS * 2 ** z, my = (a, z) => { const q = Math.sin(rad(a)); return (.5 - Math.log((1 + q) / (1 - q)) / (4 * Math.PI)) * TS * 2 ** z };
const ix = (x, z) => x / (TS * 2 ** z) * 360 - 180, iy = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / (TS * 2 ** z)))) * 180 / Math.PI;
const bbox = r => { const x = r.map(p => p[0]), y = r.map(p => p[1]); return [Math.min(...x), Math.max(...x), Math.min(...y), Math.max(...y)] };

function fitZoom(r, w, h, fr) { const [a, b, c, d] = bbox(r); for (let z = 19; z > 3; z--)if (mx(b, z) - mx(a, z) <= w * fr && my(c, z) - my(d, z) <= h * fr) return z; return 4 }
const view = (r, z, w, h) => { const [a, b, c, d] = bbox(r), ox = (mx(a, z) + mx(b, z)) / 2 - w / 2, oy = (my(c, z) + my(d, z)) / 2 - h / 2; return { ox, oy, w: ix(ox, z), e: ix(ox + w, z), n: iy(oy, z), s: iy(oy + h, z) } };
const OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function overpass(q) { let err; for (const u of OVP) { try { const r = await fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q) }); if (r.ok) return (await r.json()).elements } catch (e) { err = e } } throw err || new Error("Overpass indisponível") }

const HW = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";
const streets = v => overpass(`[out:json][timeout:25];way["highway"~"^(${HW})$"]["name"](${v.s},${v.w},${v.n},${v.e});out geom;`);

async function renderMap(rs, z, w, h, o) {
    const v = view(rs.flatMap(a => a.ring), z, w, h), ox = v.ox, oy = v.oy;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.fillStyle = "#222"; g.fillRect(0, 0, w, h);
    const jobs = []; for (let x = Math.floor(ox / TS); x <= Math.floor((ox + w) / TS); x++)for (let y = Math.floor(oy / TS); y <= Math.floor((oy + h) / TS); y++)
        jobs.push(new Promise(res => {
            const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { g.drawImage(im, x * TS - ox, y * TS - oy); res() }; im.onerror = res;
            im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
        }));
    await Promise.all(jobs); g.lineJoin = "round"; g.textAlign = "center";
    // nomes de ruas (OpenStreetMap)
    const drawn = []; g.font = "bold 22px 'Segoe UI',Arial";
    (o.streets || []).forEach(wy => {
        const nm = wy.tags && wy.tags.name; if (!nm || !wy.geometry || wy.geometry.length < 2) return;
        const Q = wy.geometry.map(q => [mx(q.lon, z) - ox, my(q.lat, z) - oy]), sg = []; let tot = 0;
        for (let i = 1; i < Q.length; i++) { const l = Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]); sg.push(l); tot += l }
        if (tot < g.measureText(nm).width + 30) return; let t = tot / 2, i = 0; while (i < sg.length - 1 && t > sg[i]) { t -= sg[i]; i++ }
        const A = Q[i], B = Q[i + 1], f = sg[i] ? t / sg[i] : 0, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f;
        if (x < 0 || y < 0 || x > w || y > h || drawn.some(d => d.n === nm && Math.hypot(d.x - x, d.y - y) < 300)) return; drawn.push({ n: nm, x, y });
        let ang = Math.atan2(B[1] - A[1], B[0] - A[0]); if (Math.abs(ang) > Math.PI / 2) ang += Math.PI;
        g.save(); g.translate(x, y); g.rotate(ang); g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(nm, 0, 7); g.fillStyle = "#fff"; g.fillText(nm, 0, 7); g.restore()
    });
    // perímetro(s)
    rs.forEach(a => {
        const r = a.ring, P = r.map(p => [mx(p[0], z) - ox, my(p[1], z) - oy]); g.beginPath(); P.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath();
        if (o.fill) { g.fillStyle = "rgba(255,230,0,.28)"; g.fill() } g.lineWidth = 6; g.strokeStyle = "#ffe600"; g.stroke();
        if (o.labels) {
            g.font = "bold 30px 'Nirmala UI','Segoe UI',Arial";
            P.forEach((p, i) => {
                const q = P[(i + 1) % P.length], px = Math.hypot(q[0] - p[0], q[1] - p[1]); if (px < 130) return;
                let ang = Math.atan2(q[1] - p[1], q[0] - p[0]); if (Math.abs(ang) > Math.PI / 2) ang += Math.PI; const t = fmt(segLen(r[i], r[(i + 1) % r.length]), 2) + "m";
                g.save(); g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); g.rotate(ang); g.lineWidth = 7; g.strokeStyle = "#000"; g.strokeText(t, 0, -14); g.fillStyle = "#ffe600"; g.fillText(t, 0, -14); g.restore()
            })
        }
        if (rs.length > 1) {
            const xs = P.map(p => p[0]), ys = P.map(p => p[1]); g.font = "bold 34px 'Segoe UI',Arial"; g.lineWidth = 7; g.strokeStyle = "#000"; g.fillStyle = "#fff";
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; g.strokeText(a.name, cx, cy); g.fillText(a.name, cx, cy)
        }
    });
    // pontos de referência (OpenStreetMap)
    (o.pois || []).forEach(q => {
        const x = mx(q.lon, z) - ox, y = my(q.lat, z) - oy; if (x < 20 || y < 20 || x > w - 20 || y > h - 30) return;
        g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = "#00e5ff"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#000"; g.stroke();
        g.font = "bold 26px 'Segoe UI',Arial"; g.lineWidth = 6; g.strokeText(q.name, x, y + 36); g.fillStyle = "#00e5ff"; g.fillText(q.name, x, y + 36)
    });
    g.font = "16px Arial"; g.textAlign = "right"; g.fillStyle = "#fff"; g.shadowColor = "#000"; g.shadowBlur = 4; g.fillText("Imagem © Esri, Maxar, Earthstar Geographics | Dados © OpenStreetMap contributors", w - 12, h - 10);
    return cv.toDataURL("image/jpeg", .9)
}

/* ---------- pontos de referência ---------- */
const CATS = ["Shopping", "Supermercado", "Escola / Universidade", "Centro comercial", "Hospital", "Via / Rodovia", "Outro"];
function addRef(n = "", c = "Shopping", d = "", lat = "", lon = "") {
    const e = document.createElement("div"); e.className = "ref"; if (lat !== "") { e.dataset.lat = lat; e.dataset.lon = lon }
    e.innerHTML = `<input placeholder="Nome" value="${String(n).replace(/"/g, "&quot;")}"><select>${CATS.map(x => `<option${x == c ? " selected" : ""}>${x}</option>`).join("")}</select><input placeholder="1,2 km" value="${d}"><button class="alt" style="margin:0;padding:0">×</button>`;
    e.querySelector("button").onclick = () => e.remove(); $("refs").appendChild(e)
}
$("addRef").onclick = () => addRef(); addRef();
const catOf = t => t.shop == "mall" ? "Shopping" : /^(supermarket|wholesale)$/.test(t.shop || "") ? "Supermercado" : (t.shop == "department_store" || t.amenity == "marketplace") ? "Centro comercial" : /^(school|college|university)$/.test(t.amenity || "") ? "Escola / Universidade" : t.amenity == "hospital" ? "Hospital" : "Outro";
const distTxt = m => m < 1000 ? Math.round(m) + " m" : fmt(m / 1000, 1) + " km"; let cand = [];
$("busca").onclick = async () => {
    const rs = incl().filter(a => a.poly); if (!rs.length) { msg("Carregue o KMZ/KML primeiro."); return }
    const [a, b, c, d] = bbox(rs.flatMap(x => x.poly.ring)), lon = (a + b) / 2, lat = (c + d) / 2, rd = $("rad").value; msg("Buscando no OpenStreetMap…");
    try {
        const el = await overpass(`[out:json][timeout:25];(nwr(around:${rd},${lat},${lon})["name"]["shop"~"^(mall|supermarket|wholesale|department_store)$"];nwr(around:${rd},${lat},${lon})["name"]["amenity"~"^(school|college|university|hospital|marketplace)$"];);out center tags;`);
        const by = {}; el.forEach(e => {
            const p = e.lat != null ? { lat: e.lat, lon: e.lon } : e.center; if (!p) return; const m = segLen([lon, lat], [p.lon, p.lat]);
            if (!by[e.tags.name] || by[e.tags.name].m > m) by[e.tags.name] = { name: e.tags.name, cat: catOf(e.tags), m, lat: p.lat, lon: p.lon }
        });
        cand = Object.values(by).sort((x, y) => x.m - y.m).slice(0, 40); poiLayer.clearLayers();
        cand.forEach(q => L.circleMarker([q.lat, q.lon], { radius: 6, color: "#00bcd4", fillOpacity: .9 }).bindTooltip(q.name).addTo(poiLayer));
        $("cands").innerHTML = cand.length ? cand.map((q, i) => `<label class="cd"><input type="checkbox" data-i="${i}"><span>${q.name.replace(/</g, "&lt;")} <small>${q.cat} · ${distTxt(q.m)}</small></span></label>`).join("") + '<button id="useC">Adicionar selecionados à tabela</button>' : "";
        if ($("useC")) $("useC").onclick = () => {
            [...document.querySelectorAll(".ref")].forEach(r => { if (!r.dataset.lat && !r.querySelector("input").value.trim()) r.remove() });
            document.querySelectorAll("#cands input:checked").forEach(x => { const q = cand[+x.dataset.i]; addRef(q.name, q.cat, distTxt(q.m), q.lat, q.lon) }); $("cands").innerHTML = ""; msg("Pontos adicionados. Você pode editar ou remover na tabela.")
        };
        msg(cand.length ? cand.length + " locais encontrados. Marque os que deseja usar." : "Nenhum local encontrado nesse raio. Aumente o raio ou adicione manualmente.")
    }
    catch (e) { msg("O OpenStreetMap não respondeu agora. Tente novamente em instantes.") }
};
$("macro").oninput = () => $("zon").style.display = $("macro").value.trim() ? "grid" : "none";

/* ---------- logotipo ---------- */
let logo = null;
$("logoF").onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => logo = { url: r.result, w: im.width, h: im.height }; im.src = r.result }; r.readAsDataURL(f) };

/* ---------- salvar / abrir dados ---------- */
$("save").onclick = () => {
    const d = {}; document.querySelectorAll("[data-k]").forEach(e => d[e.dataset.k] = e.value);
    d._refs = [...document.querySelectorAll(".ref")].map(r => [...r.querySelectorAll("input,select")].map(x => x.value).concat([r.dataset.lat || "", r.dataset.lon || ""])); d._logo = logo; d._areas = areas;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: "application/json" })); a.download = "dados-imovel.json"; a.click()
};
$("load").onclick = () => $("jf").click();
$("jf").onchange = async e => {
    try {
        const d = JSON.parse(await e.target.files[0].text()); document.querySelectorAll("[data-k]").forEach(x => { if (d[x.dataset.k] != null) x.value = d[x.dataset.k] });
        $("refs").innerHTML = ""; (d._refs || []).forEach(r => addRef(r[0], r[1], r[2], r[3] || "", r[4] || "")); if (d._areas) { areas = d._areas; renderAreas(); draw(true) } if (!d._refs?.length) addRef(); logo = d._logo || null; $("macro").oninput()
    } catch (x) { msg("Arquivo de dados inválido.") }
};

/* ---------- apresentação ---------- */
const NAVY = "0B2A5B", GRAY = "7D8590", LIGHT = "EEF0F3", NUM = "Nirmala UI";
async function gerar() {
    if (!incl().some(a => a.poly)) { msg("Carregue o KMZ/KML e marque ao menos uma área do arquivo."); return }
    if (typeof PptxGenJS === "undefined") { msg("A biblioteca de PowerPoint não carregou. Verifique a internet ou bloqueadores de anúncios e recarregue a página (F5)."); return }
    const sel = incl(), area = total(), loc = [V("bairro"), (V("cidade") + (V("uf") ? "/" + V("uf").toUpperCase() : ""))].filter(Boolean).join(", "),
        titulo = (V("code") ? "Cr. " + V("code") + " – " : "") + loc, creci = V("creci");
    msg("Gerando imagens de satélite…"); let img1, img2, aviso = ""; const rs = sel.filter(a => a.poly).map(a => ({ ring: a.poly.ring, name: a.name })), all = rs.flatMap(a => a.ring), useN = $("nomes").checked;
    try {
        const W = 1600, H = 910, z = fitZoom(all, W, H, .7), z2 = Math.max(z - 2, 12); let st = [];
        if (useN) { try { st = await streets(view(all, z2, W, H)) } catch (e) { aviso = " (nomes de ruas indisponíveis: o OpenStreetMap não respondeu)" } }
        const pois = useN ? [...document.querySelectorAll(".ref")].filter(r => r.dataset.lat).map(r => ({ name: r.querySelector("input").value.trim(), lat: +r.dataset.lat, lon: +r.dataset.lon })) : [];
        img1 = await renderMap(rs, z, W, H, { labels: $("lados").checked, streets: st, pois }); img2 = await renderMap(rs, z2, W, H, { fill: true, streets: st, pois })
    }
    catch (e) { msg("Não foi possível exportar a imagem de satélite (o servidor de imagens bloqueou ou a internet falhou)."); return }
    msg("Montando slides…");
    const p = new PptxGenJS(); p.defineLayout({ name: "BI", width: 13.333, height: 9.23 }); p.layout = "BI";
    const fitLogo = (s, x, y, w, h) => { if (!logo) return; const k = Math.min(w / logo.w, h / logo.h), lw = logo.w * k, lh = logo.h * k; s.addImage({ data: logo.url, x: x + (w - lw) / 2, y: y + (h - lh) / 2, w: lw, h: lh }) };
    const head = s => {
        s.addShape(p.ShapeType.roundRect, { x: .25, y: .25, w: 12.83, h: 1.2, fill: { color: LIGHT }, line: { color: NAVY, width: 1.5 }, rectRadius: .15 });
        s.addText(titulo, { x: .6, y: .25, w: 6.4, h: 1.2, fontFace: NUM, fontSize: 24, color: NAVY, valign: "middle" });
        s.addText([{ text: "Área Total: ", options: { bold: true, fontSize: 18, fontFace: NUM } }, { text: fmt(area, 2) + " m²", options: { fontSize: 18, fontFace: NUM } }, { text: V("fonte") ? "\n(" + V("fonte") + ")" : "", options: { fontSize: 11, color: GRAY, breakLine: false, fontFace: NUM } }], { x: 7, y: .25, w: 3.6, h: 1.2, align: "center", valign: "middle", color: NAVY });
        fitLogo(s, 10.75, .35, 2.2, 1); if (creci) s.addText(creci, { x: 0, y: 8.98, w: 13.333, h: .22, align: "center", fontSize: 9, color: GRAY })
    };
    // capa
    let s = p.addSlide(); s.background = { color: "F4F5F7" };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: .55, h: 9.23, fill: { color: NAVY } }); s.addShape(p.ShapeType.rect, { x: .65, y: 0, w: .18, h: 9.23, fill: { color: GRAY } });
    s.addText("Terreno em Oferta", { x: 1.5, y: 3.2, w: 11, h: 1.3, align: "center", fontFace: "Georgia", fontSize: 50, bold: true, color: NAVY });
    s.addText(loc || " ", { x: 1.5, y: 4.6, w: 11, h: .7, align: "center", fontFace: "Georgia", fontSize: 26, color: NAVY });
    s.addText(fmt(area, 2) + " m²" + (V("fin") ? "  |  " + V("fin") : ""), { x: 1.5, y: 5.4, w: 11, h: .5, align: "center", fontSize: 18, color: GRAY, fontFace: NUM });
    fitLogo(s, 10.5, 7.5, 2.4, 1.3);
    // imagens
    [img1, img2].forEach(d => { s = p.addSlide(); head(s); s.addImage({ data: d, x: .25, y: 1.65, w: 12.83, h: 7.3 }) });
    // dados
    s = p.addSlide(); head(s);
    const v = num(V("valor")), tiles = [["Área total", fmt(area, 2) + " m²"]]; if (sel.length > 1) sel.forEach(a => tiles.push([a.name, fmt(a.m2, 2) + " m²"])); const b = num(V("built"));
    if (b > 0) tiles.push(["Área construída", fmt(b, 2) + " m²"]);
    if (v > 0) { const tot = V("vkind") == "total" ? v : v * area, pm = V("vkind") == "total" ? v / area : v; tiles.push(["Valor de venda", "R$ " + fmt(tot, 2)], ["Valor por m²", "R$ " + fmt(pm, 2)]) }
    if (sel.length == 1) tiles.push(["Área em hectares", fmt(area / 1e4, 4) + " ha"]); if (V("fin")) tiles.push(["Finalidade", V("fin")]);
    tiles.forEach((t, i) => {
        const x = .25 + (i % 2) * 3.45, y = 1.85 + Math.floor(i / 2) * 1.75;
        s.addShape(p.ShapeType.rect, { x, y, w: 3.3, h: 1.55, fill: { color: LIGHT }, line: { color: LIGHT } }); s.addShape(p.ShapeType.rect, { x, y, w: .09, h: 1.55, fill: { color: NAVY } });
        s.addText(t[0], { x: x + .25, y: y + .15, w: 2.9, h: .4, fontSize: 13, color: GRAY });
        s.addText(t[1], { x: x + .25, y: y + .6, w: 2.95, h: .8, fontFace: NUM, fontSize: t[1].length > 14 ? 20 : 26, bold: true, color: NAVY, fit: "shrink" })
    });
    const refs = [...document.querySelectorAll(".ref")].map(r => [...r.querySelectorAll("input,select")].map(x => x.value.trim())).filter(r => r[0]);
    s.addText("Pontos de referência", { x: 7.3, y: 1.85, w: 5.8, h: .5, fontFace: "Georgia", fontSize: 20, bold: true, color: NAVY });
    if (refs.length) {
        const hd = t => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, fontSize: 13, fontFace: NUM } });
        s.addTable([[hd("Local"), hd("Tipo"), hd("Distância")], ...refs.map((r, i) => r.slice(0, 3).map(t => ({ text: t, options: { fontSize: 13, color: "1A2233", fontFace: NUM, fill: { color: i % 2 ? "FFFFFF" : LIGHT } } })))],
            { x: 7.3, y: 2.45, w: 5.78, colW: [2.7, 1.9, 1.18], border: { type: "solid", color: "D5D9E0", pt: .5 }, rowH: .5, valign: "middle" })
    }
    else s.addText("Nenhum ponto informado.", { x: 7.3, y: 2.5, w: 5.8, h: .5, fontSize: 13, color: GRAY });
    // macrozoneamento (opcional)
    if (V("macro")) {
        s = p.addSlide(); head(s);
        s.addText("Macrozoneamento", { x: .6, y: 1.8, w: 12, h: .6, fontFace: "Georgia", fontSize: 28, bold: true, color: NAVY });
        s.addText(V("macro"), { x: .6, y: 2.4, w: 12, h: .6, fontSize: 20, color: GRAY });
        const rows = [["Zona", "zona"], ["Índice de aproveitamento", "ia"], ["Taxa de ocupação", "to"], ["Gabarito / altura máxima", "gab"], ["Recuos", "recuos"], ["Usos permitidos", "usos"], ["Observações", "zobs"]].filter(r => V(r[1]));
        if (rows.length) s.addTable(rows.map((r, i) => [{ text: r[0], options: { bold: true, color: NAVY, fill: { color: LIGHT }, fontSize: 15, fontFace: NUM } }, { text: V(r[1]), options: { fontSize: 15, color: "1A2233", fontFace: NUM, fill: { color: i % 2 ? LIGHT : "FFFFFF" } } }]),
            { x: .6, y: 3.3, w: 12.1, colW: [3.7, 8.4], rowH: .6, valign: "middle", border: { type: "solid", color: "D5D9E0", pt: .5 } })
    }
    // encerramento
    s = p.addSlide(); fitLogo(s, 3.7, 2.2, 5.9, 2.6);
    s.addText([V("emp"), V("end"), V("tel"), V("mail"), creci].filter(Boolean).join("\n") || " ", { x: 2.5, y: 5, w: 8.3, h: 2.4, align: "center", fontSize: 18, color: NAVY, paraSpaceAfter: 6, fontFace: NUM });
    await p.writeFile({ fileName: "Terreno" + (V("code") ? " Cr " + V("code") : "") + " - " + (V("bairro") || "apresentacao") + ".pptx" });
    msg("Pronto. Abra o .pptx e use Arquivo > Exportar > PDF para enviar ao cliente." + aviso)
}
$("gen").onclick = () => gerar().catch(e => msg("Erro: " + e.message));
