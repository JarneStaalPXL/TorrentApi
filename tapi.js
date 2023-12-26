const express = require("express");
const cors = require("cors");
const TorrentSearchApi = require("torrent-search-api");

TorrentSearchApi.enablePublicProviders(); // Enable all public providers

const app = express();
app.use(cors()); // Use the CORS middleware
app.use(express.json());

app.use(
  cors({
    origin: "http://192.168.0.135:8080", // Only allow this origin to access the resources
  })
);

let webTorrentClient;

import("webtorrent").then((WTModule) => {
  const WebTorrent = WTModule.default;
  webTorrentClient = new WebTorrent(); // Create a single WebTorrent client instance
});

const activeDownloads = []; // Store active downloads
const downloadedMovies = []; // Store downloaded movie titles

getAllDownloadedMovies();

function getAllDownloadedMovies() {
  const fs = require("fs");
  const path = "D:\\StreamedMovies";

  let items = fs.readdirSync(path);
  items = items.filter((item) => !item.startsWith("."));
  console.log(items);
  return items;
}

function isMovieDownloadingOrExists(title) {
  for (const download of activeDownloads) {
    if (download.title.includes(title)) {
      return true;
    }
  }
  if (downloadedMovies.includes(title)) {
    return true;
  }
  return false;
}

async function searchTorrent(query) {
    try {
      query = query + " 2160p";
      const torrents = await TorrentSearchApi.search(query, "ALL", 20);
      if (torrents.length === 0) {
        return null;
      }
  
      // Filter out torrents that have MP4 files in the title or file name
      const suitableTorrent = torrents.find((torrent) => {
        const files = torrent.files || [];
        return (
          !files.some((file) => file.name.toLowerCase().endsWith('.mp4')) &&
          !/\.mp4/i.test(torrent.title) &&
          !/french/i.test(torrent.title.toLowerCase())
        );
      });
  
      if (!suitableTorrent) {
        return null; // No suitable torrents found
      }
  
      const magnetLink = await TorrentSearchApi.getMagnet(suitableTorrent);
      return magnetLink; // Return the magnet link of the first suitable torrent
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  
  

app.post("/download", async (req, res) => {
  const torrentName = req.body.name;
  if (!torrentName) {
    return res.status(400).json({ message: "No torrent name provided" });
  }

  if (isMovieDownloadingOrExists(torrentName)) {
    return res
      .status(409)
      .json({ message: "Movie is already downloading or exists" });
  }

  const torrentInfo = await searchTorrent(torrentName);
  if (!torrentInfo) {
    return res.status(404).json({ message: "Torrent not found" });
  }


  // Check if the title contains a language other than Dutch or English and no language specified
  if (
    !/dutch|english/i.test(torrentInfo.title) &&
    /french|german|spanish|italian|portuguese/i.test(torrentInfo.title)
  ) {
    return res
      .status(404)
      .json({ message: "Torrent not found due to language restriction" });
  }

  const torrentUrl = torrentInfo;
  console.log(`Torrent URL: ${torrentInfo}`);


  if (!webTorrentClient) {
    return res
      .status(500)
      .json({ message: "WebTorrent module not loaded yet" });
  }

  const torrentAdded = webTorrentClient.add(
    torrentUrl,
    { path: "D:\\StreamedMovies" },
    (torrent) => {
      console.log(`Downloading: ${torrent.name}`);

      const download = {
        title: torrent.name,
        res,
        timeout: null,
      };
      activeDownloads.push(download);

      let lastReportedPercentage = -1;
      torrent.on("download", () => {
        let currentPercentage = Math.floor(torrent.progress * 100);
        if (currentPercentage !== lastReportedPercentage) {
          console.log(
            `${
              torrent.name
            } | Progress: ${currentPercentage}% complete (down: ${(
              torrent.downloadSpeed / 1048576
            ).toFixed(2)} MB/s up: ${(torrent.uploadSpeed / 1048576).toFixed(
              2
            )} MB/s peers: ${torrent.numPeers})`
          );
          lastReportedPercentage = currentPercentage;
        }
      });

      torrent.on("done", () => {
        console.log(`${torrent.name} | Download completed`);
        downloadedMovies.push(torrent.name);

        const index = activeDownloads.findIndex(
          (d) => d.title === torrent.name
        );
        if (index !== -1) {
          if (!activeDownloads[index].res.headersSent) {
            activeDownloads[index].res
              .status(202)
              .send({ message: "Download completed" });
          }
          activeDownloads.splice(index, 1);
        }
      });
    }
  );

  res.status(202).json({ message: "Download started" });

  if (activeDownloads.length > 0) {
    activeDownloads[activeDownloads.length - 1].timeout = timeout;
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("App listening on port 3000");
});
