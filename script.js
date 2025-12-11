// Importaciones de Firebase (Ahora incluyendo autenticación por correo/Google)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, addDoc, onSnapshot, collection, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- *** PASO 1: CONFIGURACIÓN DE TU PROYECTO *** ---

// 1. CONFIGURACIÓN DE FIREBASE: 
const YOUR_FIREBASE_CONFIG = {
    // Reemplaza con tu configuración si es necesario, aunque se usa una genérica
    apiKey: "AIzaSyCVKzhEX2EiYXKBaCvAFkGf_5AI43Rl2jw",
    authDomain: "organizador-documental-con-ia.firebaseapp.com",
    projectId: "organizador-documental-con-ia",
    storageBucket: "organizador-documental-con-ia.firebasestorage.app",
    messagingSenderId: "628457706738",
    appId: "1:628457706738:web:8476271549e473f739ec6b",
    measurementId: "G-LXFC2CS59J"
};

// 2. CLAVE DE LA API DE GEMINI:
const YOUR_GEMINI_API_KEY = "";

// --- Variables globales de la App ---
let db;
let auth;
let userId = null;
const COLLECTION_NAME = 'document_records';
let lastExtractedData = null;
let isAuthReady = false;
let allDocuments = [];
let isRegisterMode = false; // Para alternar entre login y registro


// Inicializar Firebase y Autenticación
async function initializeFirebase() {
    try {
        const app = initializeApp(YOUR_FIREBASE_CONFIG);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listener del estado de autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Usuario AUTENTICADO
                userId = user.uid;
                document.getElementById('user-id-display').textContent = userId;
                document.getElementById('auth-modal').classList.add('hidden');
                document.getElementById('app-container').classList.remove('hidden');
                isAuthReady = true;
                loadDocuments();
                populateYearDropdown();
                debugLog("Usuario autenticado. UID:", userId);
            } else {
                // Usuario NO AUTENTICADO
                userId = null;
                document.getElementById('auth-modal').classList.remove('hidden');
                document.getElementById('app-container').classList.add('hidden');
                isAuthReady = false;
                console.log("Usuario no autenticado, mostrando modal de login.");
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase. Revisa la configuración:", error);
        // Si la app principal está oculta, muestra el error en el modal de auth
        displayAuthError(`Error crítico al conectar con Firebase: ${error.message}`);
    }
}

// --- Funciones de Utilidad y UI ---

function displayStatusMessage(message, type = 'info') {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.className = 'p-3 mb-4 rounded-lg text-sm';
    statusDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');

    if (type === 'error') {
        statusDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        statusDiv.classList.add('bg-green-100', 'text-green-700');
    } else { // info
        statusDiv.classList.add('bg-blue-100', 'text-blue-700');
    }
    statusDiv.classList.remove('hidden');
}

function displayAuthError(message) {
    const errorDiv = document.getElementById('auth-error-message');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function clearAuthError() {
    document.getElementById('auth-error-message').classList.add('hidden');
}

function toggleProcessing(isProcessing) {
    const btn = document.getElementById('process-btn');
    const btnText = document.getElementById('process-btn-text');
    const spinner = document.getElementById('spinner');

    if (isProcessing) {
        btn.disabled = true;
        btnText.textContent = 'Procesando...';
        spinner.classList.remove('hidden');
    } else {
        const fileInput = document.getElementById('document-upload');
        btn.disabled = !fileInput.files.length;
        btnText.textContent = 'Procesar Documento con IA';
        spinner.classList.add('hidden');
    }
}

// Hacemos que la función sea global para que pueda ser llamada desde el HTML
window.updateFileName = function (input) {
    const fileNameDisplay = document.getElementById('file-name-display');
    const processBtn = document.getElementById('process-btn');

    if (input.files.length > 0) {
        fileNameDisplay.textContent = `Archivo seleccionado: ${input.files[0].name}`;
        processBtn.disabled = false;
    } else {
        fileNameDisplay.textContent = 'Ningún archivo seleccionado.';
        processBtn.disabled = true;
    }
    document.getElementById('preview-section').classList.add('hidden');
}

function getQuarter(date) {
    const month = date.getMonth() + 1;
    return Math.ceil(month / 3);
}

function populateYearDropdown() {
    const yearSelect = document.getElementById('report-year');
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';

    let option = document.createElement('option');
    option.value = currentYear;
    option.textContent = currentYear;
    yearSelect.appendChild(option);

    option = document.createElement('option');
    option.value = currentYear - 1;
    option.textContent = currentYear - 1;
    yearSelect.appendChild(option);
}

// --- Lógica de Autenticación ---

// Event Listener para cambiar entre login y registro
document.getElementById('auth-modal').addEventListener('click', (e) => {
    if (e.target.id === 'toggle-register') {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        const authBtn = document.getElementById('auth-btn-text');
        const toggleLink = document.getElementById('toggle-register');
        const toggleTextContainer = toggleLink.parentNode;

        if (isRegisterMode) {
            authBtn.textContent = 'Registrarse';
            toggleTextContainer.innerHTML = `¿Ya tienes cuenta? <a href="#" id="toggle-register" class="text-indigo-600 hover:text-indigo-800 font-medium">Iniciar Sesión</a>`;
        } else {
            authBtn.textContent = 'Iniciar Sesión';
            toggleTextContainer.innerHTML = `¿Nuevo usuario? Inicia sesión o <a href="#" id="toggle-register" class="text-indigo-600 hover:text-indigo-800 font-medium">Regístrate</a>`;
        }
        clearAuthError();
    }
});


// Manejador de Login/Registro por Correo
document.getElementById('email-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const authBtn = document.getElementById('auth-btn-text');
    authBtn.textContent = isRegisterMode ? 'Registrando...' : 'Iniciando Sesión...';
    authBtn.parentNode.disabled = true;

    try {
        if (isRegisterMode) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error("Error de autenticación:", error);
        let errorMessage = "Error desconocido.";
        if (error.code === 'auth/user-not-found') errorMessage = "Usuario no encontrado. Intenta registrarte.";
        if (error.code === 'auth/wrong-password') errorMessage = "Contraseña incorrecta.";
        if (error.code === 'auth/email-already-in-use') errorMessage = "Este correo ya está registrado. Intenta iniciar sesión.";
        if (error.code === 'auth/invalid-email') errorMessage = "El formato del correo es inválido.";
        if (error.code === 'auth/weak-password') errorMessage = "La contraseña debe tener al menos 6 caracteres.";

        displayAuthError(errorMessage);
    } finally {
        authBtn.textContent = isRegisterMode ? 'Registrarse' : 'Iniciar Sesión';
        authBtn.parentNode.disabled = false;
    }
});

// Manejador de Login con Google (Global)
window.signInWithGoogle = async function () {
    clearAuthError();
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error de Google Auth:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            displayAuthError("Error al iniciar sesión con Google. Intenta de nuevo.");
        }
    }
}

// Función de Cerrar Sesión (Global)
window.signOutUser = async function () {
    try {
        await signOut(auth);
        displayStatusMessage("Sesión cerrada correctamente.", 'info');
        document.getElementById('documents-table-body').innerHTML = `<tr><td colspan="7" class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">Inicia sesión para ver tus documentos.</td></tr>`;
        allDocuments = [];
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        displayStatusMessage("Error al intentar cerrar sesión.", 'error');
    }
}


// --- Lógica del LLM y Procesamiento ---

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Llama a la API de Gemini para analizar la imagen y extraer datos. (Global)
 */
window.processDocument = async function () {
    if (!isAuthReady || !userId) {
        displayStatusMessage("Debes iniciar sesión para procesar documentos.", 'error');
        return;
    }

    const fileInput = document.getElementById('document-upload');
    if (!fileInput.files.length) {
        displayStatusMessage("Por favor, selecciona un archivo de imagen.", 'error');
        return;
    }

    toggleProcessing(true);
    displayStatusMessage("Analizando el documento con Inteligencia Artificial...", 'info');
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('save-btn').disabled = true;
    lastExtractedData = null;

    const file = fileInput.files[0];
    const mimeType = file.type;
    const base64ImageData = await fileToBase64(file);

    // --- Configuración de la API de Gemini ---
    const systemPrompt = "Eres un agente especializado en la extracción de datos de documentos oficiales. Tu tarea es leer la imagen proporcionada y devolver los campos solicitados en formato JSON. Si algún campo no se encuentra, usa 'N/A'. La fecha debe estar en formato YYYY-MM-DD. Todo el resultado debe ser un objeto JSON.";
    const userQuery = "Extrae los siguientes datos de este documento (la imagen proporcionada): Fecha del Documento, Número de Oficio, Destinatario (la persona a la que se dirige), Cargo Asignado, una clasificación del Tipo de Documento (por ejemplo: 'Nombramiento', 'Declaración', 'Circular'), el Remitente/Emisor del documento, un Resumen de Asunto (una frase concisa del propósito) y una lista de 3 a 5 Puntos Clave o Datos Relevantes que un humano destacaría (por ejemplo: fechas de inicio/fin de contratos, montos de ayuda, o disposiciones legales específicas).";

    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: userQuery },
                { inlineData: { mimeType: mimeType, data: base64ImageData } }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "fecha": { "type": "STRING", "description": "Fecha en formato YYYY-MM-DD, ejemplo: 2024-11-25." },
                    "oficio": { "type": "STRING", "description": "Número de oficio o referencia, ejemplo: 635/2024." },
                    "destinatario": { "type": "STRING", "description": "Nombre completo del destinatario del documento." },
                    "cargo_asignado": { "type": "STRING", "description": "Puesto o cargo principal mencionado en el documento." },
                    "tipo_documento": { "type": "STRING", "description": "Clasificación del documento: Nombramiento, Declaración, etc." },
                    "remitente_emisor": { "type": "STRING", "description": "Nombre completo de la entidad o persona que emite el documento." },
                    "asunto_resumen": { "type": "STRING", "description": "Resumen conciso del contenido del documento (una frase)." },
                    "puntos_clave_relevantes": {
                        "type": "ARRAY",
                        "description": "Lista de 3 a 5 datos importantes o relevantes del documento.",
                        "items": { "type": "STRING" }
                    }
                }
            }
        },
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const apiKey = YOUR_GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    for (let i = 0; i < 3; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {

                const jsonString = result.candidates[0].content.parts[0].text;
                const data = JSON.parse(jsonString);

                displayExtractedData(data);
                lastExtractedData = data;
                document.getElementById('preview-section').classList.remove('hidden');
                document.getElementById('save-btn').disabled = false;
                displayStatusMessage("Extracción completada. Revisa los datos antes de guardar.", 'success');
                break;
            } else {
                throw new Error("Respuesta del modelo incompleta o vacía.");
            }
        } catch (error) {
            console.error(`Intento ${i + 1} fallido:`, error);
            if (i === 2) {
                displayStatusMessage(`Error al procesar el documento después de varios intentos: ${error.message}`, 'error');
            } else {
                await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000));
            }
        }
    }
    toggleProcessing(false);
}

function displayExtractedData(data) {
    const previewDiv = document.getElementById('extracted-data-preview');

    const keyPointsList = Array.isArray(data.puntos_clave_relevantes)
        ? data.puntos_clave_relevantes.map(point => `<li class="ml-4 list-disc text-gray-800">${point}</li>`).join('')
        : '<p class="text-gray-500 italic">No se pudieron extraer puntos clave.</p>';

    previewDiv.innerHTML = `
        <p><strong>Fecha:</strong> <span class="text-indigo-600">${data.fecha || 'N/A'}</span></p>
        <p><strong>Tipo de Documento:</strong> <span class="text-indigo-600">${data.tipo_documento || 'N/A'}</span></p>
        <p><strong>Número de Oficio:</strong> <span class="text-indigo-600">${data.oficio || 'N/A'}</span></p>
        <p><strong>Remitente/Emisor:</strong> <span class="text-indigo-600">${data.remitente_emisor || 'N/A'}</span></p>
        <p><strong>Destinatario:</strong> <span class="text-indigo-600">${data.destinatario || 'N/A'}</span></p>
        <p><strong>Cargo Asignado:</strong> <span class="text-indigo-600">${data.cargo_asignado || 'N/A'}</span></p>
        <p><strong>Asunto Resumen:</strong> <span class="text-indigo-600">${data.asunto_resumen || 'N/A'}</span></p>
        <hr class="my-2 border-gray-200">
        <h4 class="font-semibold mt-2 text-gray-800">Puntos Clave Relevantes:</h4>
        <ul class="mt-1">${keyPointsList}</ul>
    `;
}


// --- Lógica de Base de Datos (Firestore) ---

/**
 * Guarda los datos extraídos en Firestore. (Global)
 */
window.saveExtractedData = async function () {
    if (!lastExtractedData) {
        displayStatusMessage("No hay datos para guardar. Procesa un documento primero.", 'error');
        return;
    }
    if (!userId) {
        displayStatusMessage("Debes iniciar sesión para guardar datos.", 'error');
        return;
    }

    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    displayStatusMessage("Guardando el registro en la base de datos...", 'info');

    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...lastExtractedData,
            userId: userId,
            timestamp: new Date().toISOString(),
            // Asegurarse de que la fecha sea válida para el índice (opcionalmente un objeto Date)
            fecha_registro: new Date(lastExtractedData.fecha).toISOString()
        });

        displayStatusMessage(`Registro guardado con ID: ${docRef.id}`, 'success');

        // Limpiar después de guardar
        document.getElementById('document-upload').value = '';
        document.getElementById('file-name-display').textContent = 'Ningún archivo seleccionado.';
        document.getElementById('preview-section').classList.add('hidden');
        lastExtractedData = null;

    } catch (e) {
        console.error("Error al añadir documento: ", e);
        displayStatusMessage("Error al intentar guardar el registro.", 'error');
    } finally {
        saveBtn.textContent = 'Guardar en la Base de Datos';
        saveBtn.disabled = false;
    }
}

/**
 * Carga los documentos del usuario en tiempo real desde Firestore.
 */
function loadDocuments() {
    if (!userId) return;

    const documentsRef = collection(db, COLLECTION_NAME);
    const tableBody = document.getElementById('documents-table-body');

    // Configura el listener en tiempo real (onSnapshot)
    onSnapshot(documentsRef, (snapshot) => {
        tableBody.innerHTML = ''; // Limpiar la tabla
        allDocuments = [];

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">No hay documentos registrados.</td></tr>`;
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            // Filtrar solo los documentos del usuario actual
            if (data.userId === userId) {
                allDocuments.push({ id: doc.id, ...data });

                const row = tableBody.insertRow();
                row.className = 'hover:bg-gray-50 transition duration-100';

                // Datos a mostrar: Fecha, Tipo, Oficio, Remitente, Destinatario, Asunto
                row.insertCell().textContent = data.fecha || 'N/A';
                row.insertCell().textContent = data.tipo_documento || 'N/A';
                row.insertCell().textContent = data.oficio || 'N/A';
                row.insertCell().textContent = data.remitente_emisor || 'N/A';
                row.insertCell().textContent = data.destinatario || 'N/A';
                row.insertCell().textContent = data.asunto_resumen ? data.asunto_resumen.substring(0, 50) + '...' : 'N/A';

                // Columna de Acción (Botón de Eliminar)
                const actionCell = row.insertCell();
                actionCell.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium';
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Eliminar';
                deleteBtn.className = 'text-red-600 hover:text-red-900 font-medium ml-4';
                deleteBtn.onclick = () => deleteDocument(doc.id);
                actionCell.appendChild(deleteBtn);
            }
        });

        // Si después de filtrar no hay documentos
        if (allDocuments.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">No hay documentos registrados.</td></tr>`;
        }

    }, (error) => {
        console.error("Error al cargar documentos:", error);
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 whitespace-nowrap text-sm text-center text-red-500">Error al cargar documentos.</td></tr>`;
    });
}

/**
 * Elimina un documento de Firestore.
 */
async function deleteDocument(docId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este documento?')) return;

    try {
        await deleteDoc(doc(db, COLLECTION_NAME, docId));
        displayStatusMessage("Documento eliminado correctamente.", 'success');
    } catch (error) {
        console.error("Error al eliminar documento:", error);
        displayStatusMessage("Error al intentar eliminar el documento.", 'error');
    }
}


// --- Lógica de Informes ---

/**
 * Genera un resumen trimestral de los documentos. (Global)
 */
window.generateQuarterlyReport = async function () {
    if (!isAuthReady || allDocuments.length === 0) {
        displayStatusMessage("No hay documentos guardados para generar un informe.", 'error');
        return;
    }

    const year = document.getElementById('report-year').value;
    const quarter = document.getElementById('report-quarter').value;
    const reportBtn = document.getElementById('report-btn');
    const reportResultsDiv = document.getElementById('report-results');
    const reportSummaryDiv = document.getElementById('report-summary');

    reportBtn.disabled = true;
    reportBtn.textContent = 'Generando...';
    reportResultsDiv.classList.add('hidden');
    displayStatusMessage(`Generando informe para el Trimestre ${quarter} del ${year} con IA...`, 'info');

    // 1. Filtrar los documentos
    const documentsInQuarter = allDocuments.filter(doc => {
        try {
            const docDate = new Date(doc.fecha);
            const docYear = docDate.getFullYear().toString();
            const docQuarter = getQuarter(docDate).toString();
            return docYear === year && docQuarter === quarter;
        } catch {
            return false; // Ignorar documentos con fecha inválida
        }
    });

    if (documentsInQuarter.length === 0) {
        displayStatusMessage(`No se encontraron documentos para el Trimestre ${quarter} del ${year}.`, 'error');
        reportBtn.disabled = false;
        reportBtn.textContent = 'Generar Informe';
        return;
    }

    // 2. Preparar el texto para el LLM
    const documentsText = documentsInQuarter.map(doc =>
        `Fecha: ${doc.fecha || 'N/A'}, Tipo: ${doc.tipo_documento || 'N/A'}, Oficio: ${doc.oficio || 'N/A'}, Remitente: ${doc.remitente_emisor || 'N/A'}, Asunto: ${doc.asunto_resumen || 'N/A'}`
    ).join('; ');

    const prompt = `Analiza la siguiente lista de registros de documentos para el Trimestre ${quarter} del año ${year} y genera un informe de gestión conciso. El informe debe incluir: 1) El número total de documentos procesados. 2) Una lista de los 3 tipos de documentos más comunes. 3) Un resumen de las tendencias o puntos clave más relevantes observados en los asuntos o remitentes. Los datos son: ${documentsText}`;

    // 3. Llamada a la API de Gemini
    const apiKey = YOUR_GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();

        const reportText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (reportText) {
            reportSummaryDiv.innerHTML = reportText.replace(/\n/g, '<br>'); // Formato simple
            reportResultsDiv.classList.remove('hidden');
            displayStatusMessage(`Informe Trimestral generado con éxito.`, 'success');
        } else {
            throw new Error("Respuesta del modelo vacía o incompleta.");
        }

    } catch (error) {
        console.error("Error al generar el informe:", error);
        displayStatusMessage(`Error al generar el informe: ${error.message}. Asegúrate de que tu clave de Gemini es correcta.`, 'error');
    } finally {
        reportBtn.disabled = false;
        reportBtn.textContent = 'Generar Informe';
    }
}


// Inicia la aplicación al cargar el script
initializeFirebase();

// Asegúrate de que las funciones globales sean accesibles desde el HTML
// Ya están declaradas con 'window.functionName = ...'