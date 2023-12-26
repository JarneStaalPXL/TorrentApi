const express = require("express");
const cors = require("cors");
const TorrentSearchApi = require("torrent-search-api");

const app = express();
app.use(cors({ origin: "http://192.168.0.135:8080" }));
app.use(express.json());

const path = "D:\\StreamedMovies";
const activeDownloads = [];
const downloadedMovies = [];

TorrentSearchApi.enablePublicProviders();

let webTorrentClient;

import("webtorrent").then((WTModule) => {
  const WebTorrent = WTModule.default;
  webTorrentClient = new WebTorrent();
});

function getAllDownloadedMovies() {
  const fs = require("fs");
  let items = fs.readdirSync(path).filter((item) => !item.startsWith("."));
  console.log(items);
  return items;
}

function isMovieDownloadingOrExists(title) {
  return (
    activeDownloads.some((download) => download.title.includes(title)) ||
    downloadedMovies.includes(title)
  );
}

async function searchTorrent(query) {
  try {
    query = query + " 2160p";
    const torrents = await TorrentSearchApi.search(query, "ALL", 20);

    if (torrents.length === 0) {
      // No torrents found
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
      // No suitable torrents found
      return null;
    }

    const magnetLink = await TorrentSearchApi.getMagnet(suitableTorrent);
    return magnetLink;
  } catch (error) {
    console.error(error);
    return null; // Handle any errors and return null for not found
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
    return res.status(500).json({ message: "WebTorrent module not loaded yet" });
  }


  const torrentAdded = webTorrentClient.add(
    torrentUrl,
    { path: path },
    (torrent) => {
      console.log(`Downloading: ${torrent.name}`);
  
      const download = {
        title: torrent.name,
        res,
      };
      activeDownloads.push(download);
  
      let lastReportedPercentage = -1;
      
      torrent.on("download", () => {
        const currentPercentage = Math.floor(torrent.progress * 100);
        if (currentPercentage !== lastReportedPercentage) {
          console.log(
            `${torrent.name} | Progress: ${currentPercentage}% complete (down: ${
              (torrent.downloadSpeed / 1048576).toFixed(2)
            } MB/s up: ${(torrent.uploadSpeed / 1048576).toFixed(2)} MB/s peers: ${
              torrent.numPeers
            })`
          );
          lastReportedPercentage = currentPercentage;
        }
      });
  
      torrent.on("done", () => {
        console.log(`${torrent.name} | Download completed`);
        downloadedMovies.push(torrent.name);
        res.status(202).send({ message: "Download completed" });
        removeDownload(torrent.name);
      });
    }
  );
  
  console.log(torrentAdded);

  res.status(202).json({ message: "Download started" });
});

function removeDownload(title) {
  const index = activeDownloads.findIndex((d) => d.title === title);
  if (index !== -1) {
    activeDownloads.splice(index, 1);
  }
}

app.listen(3000, "0.0.0.0", () => {
  console.log("App listening on port 3000");
});
