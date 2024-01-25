const express = require("express");
const fs = require("fs");
const cors = require("cors");
const serveIndex = require("serve-index");
const TorrentSearchApi = require("torrent-search-api");
const config = require("./config");
const axios = require("axios");

const app = express();
const path = "D:\\StreamedMovies";
const m3uFilePath = "D:\\TorrentApp\\public\\movies.m3u";
const terminalSocket = require("./terminalSocket");
const downloadPopularMoviesBoolean = true;

const MAX_CONNECTIONS = 1; // Set this to a reasonable number

const allowedOrigins = [
  "http://192.168.0.136:8090",
  "http://localhost:3001",
  "http://localhost",
  "http://84.193.148.142:3001", // Add this line
];

app.use(
  cors({
    origin: "*",
  })
);

app.use(
  "/streamed-movies",
  express.static(path),
  serveIndex(path, { icons: true })
);
app.use(express.json());

terminalSocket.startMovieSocket();

app.use(express.static("public"));

const tmdbApiKey = "ec8fb4c97f4c101a7e63dc22213b4106";

TorrentSearchApi.enablePublicProviders();

let webTorrentClient;

import("webtorrent").then((WTModule) => {
  const WebTorrent = WTModule.default;
  webTorrentClient = new WebTorrent({ maxConns: MAX_CONNECTIONS });
});

let popularMovies = [];
let activeDownloads = [];

let downloadedMovies = [];

(async () => {
  let popMovies = await getAllPopularMovies();

  popularMovies = popMovies.map((movie) => {
    return {
      title: movie.title,
      poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
      overview: movie.overview,
      releaseDate: movie.release_date,
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
    };
  });

  getAllDownloadedMovies();

  if (downloadPopularMoviesBoolean)
    downloadPopularMovies();

  // Rest of your code here
  app.listen(3001, "0.0.0.0", () => {
    console.log("App listening on port 3001");
    updateM3UFile();
  });
})();

async function getAllPopularMovies() {
  let allMovies = [];
  const totalPages = 20;

  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    const apiUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbApiKey}&language=en-US&page=${currentPage}`;
    try {
      const response = await axios.get(apiUrl);
      allMovies = allMovies.concat(response.data.results);
    } catch (error) {
      console.error(`Error loading movies for page ${currentPage}:`, error);
    }
  }
  return allMovies;
}

function getAllDownloadedMovies() {
  let items = fs.readdirSync(path).filter((item) => !item.startsWith("."));
  let movies = [];

  items.forEach((item) => {
    // Check if the item is a directory or a file
    if (fs.statSync(`${path}\\${item}`).isDirectory()) {
      movies.push(normalizeTitle(item));
    } else {
      // If it's a file, you might want to extract the title differently
      // This is a basic example, modify as needed
      let title = item.split(".")[0]; // Assuming the title is before the first dot
      movies.push(normalizeTitle(title));
    }
  });

  return movies;
}

function normalizeTitle(title) {
  return (
    title
      // Remove "NEW" and anything after it
      .replace(/\bNEW\b.*$/gi, "")
      // Remove contents within brackets and the brackets themselves
      .replace(/\[.*?\]|\(.*?\)/g, "")
      // Remove common file attributes and resolutions
      .replace(
        /(\.mkv|\.mp4|\.avi|1080p|720p|2160p|4K|HD|SD|BluRay|DVDrip|WEBrip|WEBdl|x264|x265|H264|H265|AAC|DDP5\.1|DD5\.1|HDR|S\d{1,2}E\d{1,2})/gi,
        ""
      )
      // Remove extra info after year
      .replace(/\b\d{4}\b.*$/, "")
      // Remove specific patterns for website mentions or groups
      .replace(/www.*?com|torrenting.*?com| - .*?$/gi, "")
      // Replace hyphens, underscores, and dots with spaces
      .replace(/[-._]/g, " ")
      // Replace multiple spaces with a single space
      .replace(/\s+/g, " ")
      // Trim whitespace from both ends
      .trim()
  );
}

function isMovieDownloadingOrExists(title) {
  const normalizedTitle = normalizeTitle(title);

  // Compare the normalized title against each downloaded movie's normalized title
  return downloadedMovies.some((movie) => {
    const movieTitleNormalized = normalizeTitle(movie.title);
    return (
      movieTitleNormalized.includes(normalizedTitle) ||
      normalizedTitle.includes(movieTitleNormalized)
    );
  });
}

function updateM3UFile(movie) {
  let m3uContents = [];
  let existingMovies = new Set();
  const m3uDir = m3uFilePath.substring(0, m3uFilePath.lastIndexOf("\\"));

  // Check if the directory exists, if not create it
  if (!fs.existsSync(m3uDir)) {
    fs.mkdirSync(m3uDir, { recursive: true });
  }

  // Check if the m3u file exists
  if (fs.existsSync(m3uFilePath)) {
    m3uContents = fs.readFileSync(m3uFilePath, "utf8").split("\n");

    m3uContents.forEach((line) => {
      if (line.startsWith("#EXTINF")) {
        let title = line.split(",")[1].trim();
        existingMovies.add(title);
      }
    });
  } else {
    m3uContents.push("#EXTM3U");
  }

  if (movie === undefined) {
    return;
  }

  if (!existingMovies.has(movie.title)) {
    // Generate the correct URL path for the movie
    let relativeFilePath = movie.filePath
      .replace(path + "\\", "")
      .replace(/\\/g, "/");
    let movieEntry = `#EXTINF:-1 tvg-logo="${
      movie.poster
    }" group-title="Movies",${normalizeTitle(
      movie.title
    )}\nhttp://192.168.0.136:3000/streamed-movies/${encodeURIComponent(
      relativeFilePath
    )}\n`;
    m3uContents.push(movieEntry);
  }

  // Write the updated contents back to the m3u file
  fs.writeFileSync(m3uFilePath, m3uContents.join("\n"));
}

async function searchTorrent(query, quality = "1080", limit = 20) {
  try {
    query = query;
    const torrents = await TorrentSearchApi.search(query, "ALL", limit);

    if (torrents.length === 0) {
      // No torrents found
      return null;
    }

    // Filter out torrents that have MP4 files in the title or file name
    const suitableTorrent = torrents.find((torrent) => {
      const files = torrent.files || [];
      return (
        !files.some((file) => file.name.toLowerCase().endsWith(".mp4")) &&
        !/\.mp4/i.test(torrent.title) &&
        !/french/i.test(torrent.title.toLowerCase())
      );
    });

    if (!suitableTorrent) {
      // No suitable torrents found
      return null;
    }

    const magnetLink = await TorrentSearchApi.getMagnet(suitableTorrent);

    // Check if the magnet link is valid (not a placeholder)
    if (
      !magnetLink ||
      magnetLink.includes("0000000000000000000000000000000000000000")
    ) {
      console.log(`\nInvalid magnet link for ${query}`);
      return null;
    }

    return magnetLink;
  } catch (error) {
    console.error(`\nError searching torrent for ${query}:`, error);
    return null; // Handle any errors and return null for not found
  }
}

app.post("/download", async (req, res) => {
  const torrentName = req.body.name;

  if (!torrentName) {
    return res.status(400).json({ message: "No torrent name provided" });
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

  let torrentUrl = torrentInfo;
  if (!webTorrentClient) {
    return res
      .status(500)
      .json({ message: "WebTorrent module not loaded yet" });
  }

  // Check if the torrent with the same infoHash is already added
  const existingTorrent = webTorrentClient.torrents.find(
    (torrent) => torrent.infoHash === torrentInfo.infoHash
  );

  if (existingTorrent) {
    // Torrent with the same infoHash already exists, skip adding it again
    return res.status(409).json({ message: "Duplicate torrent infoHash" });
  }

  const downloadPath = path; // Set your desired download path here
  webTorrentClient.add(torrentUrl, { path: downloadPath }, (torrent) => {
    console.log(`Downloading: ${torrent.name}`);

    const download = {
      title: torrent.name,
    };
    activeDownloads.push(download);

    let lastReportedPercentage = -1;

    torrent.on("download", () => {
      const currentPercentage = Math.floor(torrent.progress * 100);
      if (currentPercentage !== lastReportedPercentage) {
        // console.log(
        //   `${torrent.name} | Progress: ${currentPercentage}% complete (down: ${(
        //     torrent.downloadSpeed / 1048576
        //   ).toFixed(2)} MB/s up: ${(torrent.uploadSpeed / 1048576).toFixed(
        //     2
        //   )} MB/s peers: ${torrent.numPeers})`
        // );
        lastReportedPercentage = currentPercentage;
      }
    });

    torrent.on("done", () => {
      console.log(`\n${torrent.name} | Download completed`);
      downloadedMovies.push({ title: normalizeTitle(torrent.name) });
      removeDownload(torrent.name);

      // Find the downloaded movie's file path
      const movieFilePath = path + "\\" + torrent.files[0].path;

      // Generate the correct URL path for the movie
      let relativeFilePath = movieFilePath
        .replace(path + "\\", "")
        .replace(/\\/g, "/");
      let movieEntry = `#EXTINF:-1 tvg-logo="${
        movie.poster
      }" group-title="Movies",${normalizeTitle(
        torrent.name
      )}\nhttp://192.168.0.136:3000/streamed-movies/${encodeURIComponent(
        relativeFilePath
      )}\n`;
      fs.appendFileSync(m3uFilePath, movieEntry);
    });

    torrent.on("error", (err) => {
      console.error(`${torrent.name} | Error: ${err}`);
      removeDownload(torrent.name);
    });

    res.status(200).json({ message: "Download started", torrentName });
  });
});

app.get("/popular-movies", (req, res) => {
  res.json(popularMovies);
});

app.get("/downloaded-movies", (req, res) => {
  res.json(downloadedMovies);
});

app.get("/active-downloads", (req, res) => {
  // Map over activeDownloads to create a new array with normalized titles
  const normalizedActiveDownloads = activeDownloads.map((download) => ({
    ...download,
    title: normalizeTitle(download.title), // Normalize the title
  }));

  res.json(normalizedActiveDownloads); // Send the modified list as the response
});

app.get("/disk-usage", async (req, res) => {
  const diskInfo = await getDiskUsage();
  res.json({ diskInfo });
});

app.delete("/cancel-download/:title", (req, res) => {
  const title = req.params.title;
  const torrent = webTorrentClient.torrents.find(
    (torrent) => normalizeTitle(torrent.name) === title
  );

  if (torrent) {
    torrent.destroy(() => {
      removeDownload(title);
      res
        .status(200)
        .json({ message: "Download canceled", torrentName: title });
    });
  } else {
    res.status(404).json({ message: "Download not found" });
  }
});

function removeDownload(title) {
  activeDownloads = activeDownloads.filter(
    (download) => normalizeTitle(download.title) !== title
  );
}

async function downloadPopularMovies() {
  for (const movie of popularMovies) {
    if (!isMovieDownloadingOrExists(movie.title)) {
      const torrentInfo = await searchTorrent(movie.title);
      if (torrentInfo) {
        let torrentUrl = torrentInfo;

        if (!webTorrentClient) {
          console.error("WebTorrent module not loaded yet");
          return;
        }

        // Wait for a delay before adding the next torrent
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds delay

        const existingTorrent = webTorrentClient.torrents.find(
          (torrent) => torrent.infoHash === torrentInfo.infoHash
        );

        if (!existingTorrent) {
          const downloadPath = path; // Set your desired download path here
          webTorrentClient.add(
            torrentUrl,
            { path: downloadPath, maxConns: MAX_CONNECTIONS },
            (torrent) => {
              console.log(`\nDownloading: ${torrent.name}`);
              const download = {
                title: torrent.name,
                progress: 0, // initial progress is 0%
              };
              activeDownloads.push(download);
              
              terminalSocket.sendActiveDownloadsToClients(); // This will send the updated list to all clients

              let lastReportedPercentage = -1;

              let normalizedTitle = normalizeTitle(torrent.name);

              torrent.on("download", () => {
                const currentPercentage = Math.floor(torrent.progress * 100);
                const downloadIndex = activeDownloads.findIndex(
                  (d) => d.title === torrent.name
                );
                if (downloadIndex !== -1) {
                  activeDownloads[downloadIndex].progress = currentPercentage;
                }
                if (currentPercentage !== lastReportedPercentage) {
                  // console.log(
                  //   `\n${normalizedTitle} | Progress: ${currentPercentage}% complete (down: ${(
                  //     torrent.downloadSpeed / 1048576
                  //   ).toFixed(2)} MB/s up: ${(
                  //     torrent.uploadSpeed / 1048576
                  //   ).toFixed(2)} MB/s peers: ${torrent.numPeers})`
                  // );
                  lastReportedPercentage = currentPercentage;
                  terminalSocket.sendActiveDownloadsToClients(); // This will send the updated list to all clients
                }
              });

              torrent.on("done", () => {
                console.log(`\n${normalizedTitle} | Download completed`);

                // Find the downloaded movie's file path
                const movieFilePath = path + "\\" + torrent.files[0].path;
                const normalizedFilePath =
                  path + "\\" + normalizedTitle + ".mkv"; // Assuming the file is an .mkv

                // Rename the downloaded file to the normalized title
                fs.rename(movieFilePath, normalizedFilePath, (err) => {
                  if (err) {
                    console.error(`Error renaming file: ${err}`);
                    return;
                  }

                  downloadedMovies.push({ title: normalizedTitle });
                  terminalSocket.sendActiveDownloadsToClients(); // This will send the updated list to all clients
                  removeDownload(torrent.name);

                  // Generate the correct URL path for the movie
                  let relativeFilePath = normalizedFilePath
                    .replace(path + "\\", "")
                    .replace(/\\/g, "/");
                  let movieEntry = `#EXTINF:-1 tvg-logo="${
                    movie.poster
                  }" group-title="Movies",${normalizedTitle}\nhttp://192.168.0.136:3000/streamed-movies/${encodeURIComponent(
                    relativeFilePath
                  )}\n`;

                  // Append the new movie entry to the M3U file
                  fs.appendFileSync(m3uFilePath, movieEntry);
                });
              });

              torrent.on("error", (err) => {
                console.error(`${torrent.name} | Error: ${err}`);
                removeDownload(torrent.name);
              });
            }
          );
        }
      }
    }
  }
}

module.exports.getActiveDownloads = function() {
  return activeDownloads;
};

