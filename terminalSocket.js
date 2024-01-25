// Import WebSocket module
const WebSocket = require("ws");
const tapi = require('./tapi');


// Define wss at a higher scope
let wss;

// Exported function
module.exports.startMovieSocket = function() {
  wss = new WebSocket.Server({ host: "192.168.0.136", port: 8085 });

  const originalLog = console.log;
  console.log = function (message) {
    originalLog(message);
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  wss.on("connection", function connection(ws) {
    ws.on("message", function incoming(message) {
      console.log("received: %s", message);
    });

    ws.send("WebSocket connection established");
  });

  setInterval(sendDiskUsageToClients, 1000); // Check every 10 seconds
}

function sendActiveDownloadsToClients() {
  const downloads = tapi.getActiveDownloads().filter(download => download.progress < 100).sort((a, b) => b.progress - a.progress );
  const downloadsData = JSON.stringify(downloads);
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(downloadsData);
    }
  });
}

module.exports.sendActiveDownloadsToClients = sendActiveDownloadsToClients;


// Function to convert bytes to gigabytes
function bytesToGB(bytes) {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2); // Convert to GB and round to 2 decimal places
}

// Function to get disk usage information in GB
async function getDiskUsage() {
  try {
    const diskusage = require("diskusage");
    const info = await diskusage.check("D:\\");
    const totalGB = bytesToGB(info.total);
    const usedGB = bytesToGB(info.total - info.available);
    const usedPercentage = ((usedGB / totalGB) * 100).toFixed(2);
    return `Disk Usage: ${usedGB}/${totalGB} GB. (${usedPercentage}%)`;
  } catch (err) {
    console.error(`Error getting disk usage: ${err}`);
    return `Error getting disk usage: ${err}`;
  }
}

// Function to send disk usage to WebSocket clients
function sendDiskUsageToClients() {
  getDiskUsage().then((diskInfo) => {
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(diskInfo);
      }
    });
  });
}
