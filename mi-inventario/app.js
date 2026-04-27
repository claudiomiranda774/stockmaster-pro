// ==========================================
// 1. SEGURIDAD: BLOQUEO POR DOMINIO Y ANTI-COPIA
// ==========================================
const dominioPermitido = "tu-usuario.github.io"; 

if (window.location.hostname !== "localhost" && 
    window.location.hostname !== "127.0.0.1" && 
    !window.location.hostname.includes(dominioPermitido) &&
    window.location.protocol !== "file:") {
    
    document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>❌ Licencia No Autorizada</h1><p>Este software no está autorizado para este dominio.</p></div>";
    throw new Error("Copia no autorizada.");
}

document.oncontextmenu = () => false;
document.onkeydown = (e) => {
    if(e.keyCode == 123 || (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 74 || e.keyCode == 67)) || (e.ctrlKey && e.keyCode == 85)) {
        return false;
    }
};

// ==========================================
// 2. CONTROL DE ACCESO (LICENCIA)
// ==========================================
const MI_CLAVE_SECRETA = "STOCK-PRO-2024"; 

function verificarLicencia() {
    const input = document.getElementById('clave-acceso').value;
    if (input === MI_CLAVE_SECRETA) {
        localStorage.setItem('sm_licencia_v4', 'activa');
        document.getElementById('pantalla-licencia').style.display = 'none';
    } else {
        document.getElementById('error-licencia').style.display = 'block';
    }
}

if (localStorage.getItem('sm_licencia_v4') === 'activa') {
    document.getElementById('pantalla-licencia').style.display = 'none';
}

// ==========================================
// 3. CONFIGURACIÓN DE DATOS E INTERFAZ
// ==========================================
const simbolos = { 'CLP': '$', 'USD': 'US$', 'EUR': '€', 'MXN': 'MX$' };
let inventario = JSON.parse(localStorage.getItem('stockmaster_v4_master')) || [];
let monedaActual = localStorage.getItem('sm_moneda_v4') || 'CLP';
let filtroActivo = 'todos';
let miGraficoCategorias = null;
let miGraficoStock = null;

const lista = document.getElementById('lista-productos');
const buscador = document.getElementById('buscador');
const selMoneda = document.getElementById('selector-moneda');

if(selMoneda) selMoneda.value = monedaActual;

function fmt(v) {
    const s = simbolos[monedaActual];
    return monedaActual === 'CLP' 
        ? `${s}${Math.round(v).toLocaleString('es-CL')}`
        : `${s}${Number(v).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
}

// ==========================================
// 4. RENDERIZADO Y LÓGICA DE NEGOCIO
// ==========================================
function render() {
    lista.innerHTML = '';
    let stockBajo = 0, valorVentaTotal = 0, gananciaTotal = 0;
    let datosPorCategoria = {};
    let stockNormal = 0, stockCritico = 0, stockAgotado = 0;

    const term = buscador.value.toLowerCase();

    const filtrados = inventario.filter(p => {
        const matches = p.nombre.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.categoria.toLowerCase().includes(term);
        if (filtroActivo === 'bajo') return matches && p.cantidad < 5;
        return matches;
    });

    filtrados.forEach((p, i) => {
        const valorFila = p.cantidad * p.precio;
        const gananciaFila = (p.precio - p.costo) * p.cantidad;
        
        valorVentaTotal += valorFila;
        gananciaTotal += gananciaFila;

        const cat = p.categoria || "Sin Categoría";
        datosPorCategoria[cat] = (datosPorCategoria[cat] || 0) + valorFila;

        if(p.cantidad === 0) stockAgotado++;
        else if(p.cantidad < 5) { stockCritico++; stockBajo++; }
        else stockNormal++;

        const tr = document.createElement('tr');
        const badgeClass = p.cantidad === 0 ? 'badge-none' : (p.cantidad < 5 ? 'badge-low' : 'badge-ok');
        const badgeText = p.cantidad === 0 ? 'AGOTADO' : (p.cantidad < 5 ? 'BAJO' : 'OK');

        tr.innerHTML = `
            <td><strong>${p.nombre}</strong><br><small style="color:#64748b">SKU: ${p.sku || 'N/A'}</small></td>
            <td>${p.categoria || 'Gral.'}</td>
            <td><span class="badge ${badgeClass}">${badgeText}: ${p.cantidad} ${p.unidad}</span></td>
            <td>${fmt(p.precio)}</td>
            <td style="color:#10b981; font-weight:700">${fmt(gananciaFila)}</td>
            <td>
                <div class="action-group" style="display:flex; gap:5px;">
                    <button onclick="updateStock(${i}, -1)" class="t-btn">🛒</button>
                    <button onclick="updateStock(${i}, 1)" class="t-btn">➕</button>
                    <button onclick="deleteItem(${i})" class="t-btn">🗑️</button>
                </div>
            </td>
        `;
        lista.appendChild(tr);
    });

    document.getElementById('total-articulos').innerText = inventario.length;
    document.getElementById('alertas-stock').innerText = stockBajo;
    document.getElementById('valor-total-bodega').innerText = fmt(valorVentaTotal);
    document.getElementById('ganancia-total').innerText = fmt(gananciaTotal);

    actualizarGraficos(datosPorCategoria, stockNormal, stockCritico, stockAgotado);
    
    localStorage.setItem('stockmaster_v4_master', JSON.stringify(inventario));
    localStorage.setItem('sm_moneda_v4', monedaActual);
}

// ==========================================
// 5. GRÁFICOS (INTELIGENTES CON AGRUPACIÓN "OTROS")
// ==========================================
function actualizarGraficos(datosCat, normal, critico, agotado) {
    const ctx1 = document.getElementById('graficoCategorias').getContext('2d');
    const ctx2 = document.getElementById('graficoStock').getContext('2d');

    if (miGraficoCategorias) miGraficoCategorias.destroy();
    if (miGraficoStock) miGraficoStock.destroy();

    // --- LÓGICA ANTI-SATURACIÓN ---
    const categoriasOrdenadas = Object.entries(datosCat).sort((a, b) => b[1] - a[1]);
    let etiquetasFinales = [], valoresFinales = [];

    if (categoriasOrdenadas.length > 5) {
        for (let i = 0; i < 5; i++) {
            etiquetasFinales.push(categoriasOrdenadas[i][0]);
            valoresFinales.push(categoriasOrdenadas[i][1]);
        }
        const sumaOtros = categoriasOrdenadas.slice(5).reduce((total, item) => total + item[1], 0);
        etiquetasFinales.push("Otros");
        valoresFinales.push(sumaOtros);
    } else {
        etiquetasFinales = Object.keys(datosCat);
        valoresFinales = Object.values(datosCat);
    }

    const colores = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

    miGraficoCategorias = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: etiquetasFinales,
            datasets: [{
                data: valoresFinales,
                backgroundColor: colores,
                borderWidth: 2,
                hoverOffset: 15
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } } },
            cutout: '70%'
        }
    });

    miGraficoStock = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: ['Stock OK', 'Crítico', 'Agotado'],
            datasets: [{
                label: 'Cantidad',
                data: [normal, critico, agotado],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderRadius: 8
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
}

// ==========================================
// 6. FUNCIONES DE OPERACIÓN
// ==========================================
document.getElementById('formulario-producto').addEventListener('submit', (e) => {
    e.preventDefault();
    inventario.push({
        nombre: document.getElementById('nombre').value.trim(),
        categoria: document.getElementById('categoria').value.trim(),
        unidad: document.getElementById('unidad').value,
        sku: document.getElementById('sku').value.trim(),
        cantidad: parseInt(document.getElementById('cantidad').value) || 0,
        costo: parseFloat(document.getElementById('costo').value) || 0,
        precio: parseFloat(document.getElementById('precio').value) || 0
    });
    e.target.reset();
    render();
});

function updateStock(i, n) {
    if(inventario[i].cantidad + n < 0) return;
    inventario[i].cantidad += n;
    render();
}

function deleteItem(i) {
    if(confirm(`¿Eliminar "${inventario[i].nombre}"?`)) {
        inventario.splice(i, 1);
        render();
    }
}

function limpiarTodo() {
    if(prompt("Escribe BORRAR para vaciar todo:") === "BORRAR") {
        inventario = [];
        render();
    }
}

function exportarCSV() {
    let csv = "\uFEFFsep=;\nNombre;Categoria;SKU;Stock;Unidad;Costo;Precio;Ganancia\n";
    inventario.forEach(p => {
        csv += `"${p.nombre}";"${p.categoria}";"${p.sku}";${p.cantidad};"${p.unidad}";${p.costo};${p.precio};${(p.precio-p.costo)*p.cantidad}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Inventario.csv`;
    link.click();
}

// IMPORTACIÓN MASIVA
function abrirImportador() { document.getElementById('modal-importador').style.display='flex'; }
function cerrarImportador() { document.getElementById('modal-importador').style.display='none'; }

function procesarImportacion() {
    const data = document.getElementById('csv-input').value;
    data.split('\n').forEach(f => {
        const c = f.split('\t');
        if(c.length >= 6) {
            inventario.push({
                nombre: c[0].trim(), categoria: c[1].trim(), sku: c[2].trim(),
                cantidad: parseInt(c[3]) || 0, costo: parseFloat(c[4]) || 0,
                precio: parseFloat(c[5]) || 0, unidad: 'un'
            });
        }
    });
    cerrarImportador();
    render();
}

function filtrar(t) {
    filtroActivo = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    render();
}

buscador.addEventListener('input', render);
selMoneda.addEventListener('change', (e) => { monedaActual = e.target.value; render(); });

// ACTIVACIÓN DE MODO ESCÁNER
let scannerActivo = false, buffer = "";
function activarModoScanner() {
    scannerActivo = !scannerActivo;
    document.getElementById('btn-scanner').style.background = scannerActivo ? "#dcfce7" : "white";
    alert(scannerActivo ? "Modo Escáner: ON" : "Modo Escáner: OFF");
}
document.addEventListener('keydown', (e) => {
    if(!scannerActivo || e.target.tagName === 'INPUT') return;
    if(e.key === 'Enter') {
        const i = inventario.findIndex(p => p.sku === buffer);
        if(i !== -1) updateStock(i, -1);
        buffer = "";
    } else if(e.key.length === 1) buffer += e.key;
});

// INICIO
render();