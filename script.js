const API_BASE = window.location.port === "3000"
    ? window.location.origin
    : "http://localhost:3000";

let studentDashboardTimer = null;

document.addEventListener("DOMContentLoaded", () => {
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    const isSubmitted = localStorage.getItem("transactionSubmitted");
    const qNum = localStorage.getItem("queue_num");

    const loginScreen = document.getElementById('login-screen');
    const generateScreen = document.getElementById('generate-screen');
    const navbar = document.getElementById('navbar');

    if (isLoggedIn === "true") {
        if (loginScreen) loginScreen.classList.add('hidden');
        if (generateScreen) generateScreen.classList.remove('hidden');
        if (navbar) navbar.classList.remove('hidden');

        // ticket checkers
        if (isSubmitted === "true" && qNum) {
            setWaitingDashboardView();
            updateStudentDashboard();
            startStudentDashboardUpdates();
        }
    }
    
    checkSystemAvailability();
    setInterval(checkSystemAvailability, 5000);
});

function showNotifications() {
    window.location.href = "notifications.html"; 
}

function showRecords() {
    window.location.href = "records.html"; 
}

function goHome() {
    window.location.href = "index.html";
}

/* AUTHENTICATION */
function checkLogin() {
    const emailInput = document.getElementById('user-email').value;
    const idInput = document.getElementById('studentID').value;

    const adminEmails = ["admin1@gmail.com", "admin2@gmail.com", "admin3@gmail.com"];
    const studentEmail = "JomarieImgay@gmail.com";
    const studentID = "20206767";

    if (!emailInput || !idInput) {
        alert("Please enter both email and ID");
        return;
    }

    if (adminEmails.includes(emailInput)) {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("isAdmin", "true");
        localStorage.setItem("adminEmail", emailInput);
        localStorage.removeItem("studentEmail");
        localStorage.removeItem("studentID");
        localStorage.removeItem("queue_num");
        localStorage.removeItem("transactionSubmitted");
        window.location.href = "admin.html";
    } 
    else if (emailInput === studentEmail && idInput === studentID) {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.removeItem("isAdmin");
        localStorage.removeItem("adminEmail");
        localStorage.setItem("studentEmail", emailInput);
        localStorage.setItem("studentID", idInput);
        localStorage.removeItem("queue_num");
        localStorage.removeItem("transactionSubmitted");
        window.location.reload(); 
    } else {
        alert("Invalid credentials.");
    }
}

function generateQueue() {
    const num = Math.floor(Math.random() * 900) + 100;
    const studentID = localStorage.getItem("studentID");

    localStorage.setItem("queue_num", num);
    
    const qDisplay = document.getElementById('queue-display');
    const idDisplay = document.getElementById('display-studentID');
    
    if (qDisplay) qDisplay.innerText = "#" + num;
    if (idDisplay) idDisplay.innerText = "Student ID: " + studentID;

    document.getElementById('pre-generate')?.classList.add('hidden');
    document.getElementById('queue-result')?.classList.remove('hidden');
}

function goToDetails() {
    document.getElementById('queue-result')?.classList.add('hidden');
    document.getElementById('details-screen')?.classList.remove('hidden');
}

function checkSystemAvailability() {
    fetch(`${API_BASE}/get-system-status`)
        .then(res => res.json())
        .then(data => {
            const isAnyOnline = Object.values(data.windowStatuses).includes("Online");
            const statusLabel = document.getElementById('system-status-indicator');

            if (statusLabel) {
                if (!isAnyOnline) {
                    statusLabel.innerText = "OFFLINE - Windows Closed";
                    statusLabel.style.color = "red";
                } else {
                    statusLabel.innerText = "ONLINE - Windows Active";
                    statusLabel.style.color = "green";
                }
            }
        })
        .catch(err => console.error('Error checking system status:', err));
}

function getStoredOrDisplayedQueueNum() {
    const storedQueue = localStorage.getItem("queue_num");
    if (storedQueue) return storedQueue;

    const displayText = document.getElementById('queue-display')?.innerText || "";
    const displayedQueue = displayText.replace(/\D/g, "");
    if (displayedQueue) {
        localStorage.setItem("queue_num", displayedQueue);
        return displayedQueue;
    }

    return "";
}

function getStoredOrDisplayedStudentID() {
    const storedStudentID = localStorage.getItem("studentID");
    if (storedStudentID) return storedStudentID;

    const displayText = document.getElementById('display-studentID')?.innerText || "";
    const displayedStudentID = displayText.replace(/\D/g, "");
    if (displayedStudentID) {
        localStorage.setItem("studentID", displayedStudentID);
        return displayedStudentID;
    }

    return "";
}

function startStudentDashboardUpdates() {
    if (studentDashboardTimer) return;
    studentDashboardTimer = setInterval(updateStudentDashboard, 2000);
}

function finishTransaction() {
    console.log('finishTransaction() called');
    
    const date = document.getElementById('trans-date').value;
    const time = document.getElementById('trans-time').value;
    const type = document.getElementById('trans-type').value;

    console.log('Form values - Date:', date, 'Time:', time, 'Type:', type);

    if (!date || !time || !type) {
        alert("Please fill in all fields");
        return;
    }

    const qNum = getStoredOrDisplayedQueueNum();
    const studentID = getStoredOrDisplayedStudentID();
    
    if (!qNum) {
        alert("Session error. Please generate your queue number again.");
        document.getElementById('details-screen')?.classList.add('hidden');
        document.getElementById('pre-generate')?.classList.remove('hidden');
        document.getElementById('queue-result')?.classList.add('hidden');
        return;
    }

    const payload = {
        queue_num: parseInt(qNum),
        student_id: studentID || localStorage.getItem("studentEmail") || "Student",
        service_type: type
    };

    console.log('Sending payload:', payload);

    fetch(`${API_BASE}/add-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => {
        console.log('Response status:', res.status);
        return res.text().then(text => ({
            ok: res.ok,
            data: text ? JSON.parse(text) : {}
        }));
    })
    .then(({ ok, data }) => {
        console.log('Response data:', data);
        
        if (!ok || data.error) {
            alert("Error: " + data.error);
            return;
        }
        
        let records = JSON.parse(localStorage.getItem('studentRecords')) || [];
        const record = {
            queue_num: payload.queue_num,
            studentID: payload.student_id,
            email: localStorage.getItem("studentEmail"),
            date: date,
            time: time,
            type: type
        };
        
        records.push(record);
        localStorage.setItem('studentRecords', JSON.stringify(records));
        localStorage.setItem("transactionSubmitted", "true");
        
        console.log('Transaction saved successfully');
        
        setWaitingDashboardView();
        updateStudentDashboard();
        startStudentDashboardUpdates();
    })
    .catch(err => {
        console.error('Fetch error:', err);
        alert("Error submitting transaction: " + err.message);
    });
}

function updateStudentDashboard() {
    fetch(`${API_BASE}/get-system-status`)
        .then(res => res.json())
        .then(data => {
            const servingDisplay = document.getElementById('current-serving-number');
            const servingText = document.getElementById('current-serving-text');
            const myNumber = localStorage.getItem("queue_num");

            if (data.currentCall && data.currentCall.queue_num !== "---") {
                const calledNum = String(data.currentCall.queue_num);
               
                if (servingDisplay) {
                    servingDisplay.innerText = "#" + calledNum;
                    servingDisplay.style.color = calledNum === String(myNumber) ? "gold" : "#00f0ff";
                }

                if (servingText) {
                    servingText.innerHTML = `Now Serving: <span style="color: ${calledNum === String(myNumber) ? "gold" : "#00f0ff"}; font-weight: bold;">#${calledNum}</span>`;
                }

                if (calledNum === String(myNumber)) {
                    if (localStorage.getItem("lastNotified") !== calledNum) {
                        if (servingDisplay) servingDisplay.style.color = "gold";
                        alert("🔔 YOUR TURN! Please proceed to " + data.currentCall.window);
                        localStorage.setItem("lastNotified", calledNum);
                    }
                }
            } else {
                if (servingDisplay) {
                    servingDisplay.innerText = "#---";
                    servingDisplay.style.color = "#00f0ff";
                }

                if (servingText) {
                    servingText.innerHTML = 'Now Serving: <span style="color: #00f0ff; font-weight: bold;">#---</span>';
                }
            }
        })
        .catch(err => console.error('Error updating dashboard:', err));
}

function setWaitingDashboardView() {
    document.getElementById('pre-generate')?.classList.add('hidden');
    document.getElementById('details-screen')?.classList.add('hidden');

    const resultScreen = document.getElementById('queue-result');
    if (resultScreen) resultScreen.classList.remove('hidden');

    const continueBtn = document.querySelector('.continue-btn');
    if (continueBtn) continueBtn.style.display = "none";

    const myDisplay = document.getElementById('my-queue-display') || document.getElementById('queue-display');
    if (myDisplay) {
        myDisplay.innerText = "#" + localStorage.getItem("queue_num");
        myDisplay.style.display = "block";
    }
}

function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}
