const express = require("express");
const fs = require("fs");
const cors = require("cors");
const serveIndex = require("serve-index");
const TorrentSearchApi = require("torrent-search-api");
const config = require("./config");
const axios = require("axios");

const app = express();
const path = "D:\\StreamedMovies";
const m3uFilePath = "D:\\m3ustreaming\\movies.m3u";
app.use(cors({ origin: "http://192.168.0.136:8090" }));
app.use(
  "/streamed-movies",
  express.static(path),
  serveIndex(path, { icons: true })
);
app.use(express.json());

const tmdbApiKey = "ec8fb4c97f4c101a7e63dc22213b4106";

TorrentSearchApi.enablePublicProviders();

let webTorrentClient;

import("webtorrent").then((WTModule) => {
  const WebTorrent = WTModule.default;
  webTorrentClient = new WebTorrent();
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
    let moviePath = path + "\\" + item;

    // Check if the item is a directory
    if (fs.statSync(moviePath).isDirectory()) {
      let movieFiles = fs
        .readdirSync(moviePath)
        .filter((file) => file.endsWith(".mkv") || file.endsWith(".mp4"));

      if (movieFiles.length > 0) {
        // Assuming the first .mkv or .mp4 file is the main movie file
        movies.push({
          title: item,
          filePath: moviePath + "\\" + movieFiles[0],
        });
      }
    }
  });

  return movies;
}

getAllDownloadedMovies();

function standardizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isMovieDownloadingOrExists(title) {
  const standardizedTitle = standardizeTitle(title);

  return (
    activeDownloads.some((download) =>
      standardizeTitle(download.title).includes(standardizedTitle)
    ) ||
    downloadedMovies.some((downloadedTitle) => {
      const standardizedDownloadedTitle = standardizeTitle(downloadedTitle);
      return (
        standardizedDownloadedTitle === standardizedTitle ||
        standardizedDownloadedTitle.includes(standardizedTitle) ||
        standardizedTitle.includes(standardizedDownloadedTitle)
      );
    })
  );
}

// function updateM3UFile(movie) {
//   let m3uContents = [];
//   let existingMovies = new Set();
//   const m3uDir = m3uFilePath.substring(0, m3uFilePath.lastIndexOf('\\'));

//   // Check if the directory exists, if not create it
//   if (!fs.existsSync(m3uDir)) {
//     fs.mkdirSync(m3uDir, { recursive: true });
//   }

//   // Check if the m3u file exists
//   if (fs.existsSync(m3uFilePath)) {
//     m3uContents = fs.readFileSync(m3uFilePath, 'utf8').split('\n');

//     m3uContents.forEach(line => {
//       if (line.startsWith("#EXTINF")) {
//         let title = line.split(',')[1].trim();
//         existingMovies.add(title);
//       }
//     });
//   } else {
//     m3uContents.push('#EXTM3U');
//   }

//   let allDownloadedMovies = getAllDownloadedMovies();

//   console.log(allDownloadedMovies);
//   allDownloadedMovies.forEach(movie => {
//     if (!existingMovies.has(movie.title)) {
//       // Generate the correct URL path for the movie
//       let relativeFilePath = movie.filePath.replace(path + "\\", "").replace(/\\/g, "/");
//       let movieEntry = `#EXTINF:-1 tvg-logo="${movie.poster}" group-title="Movies",${movie.title}\nhttp://192.168.0.136:3000/streamed-movies/${encodeURIComponent(relativeFilePath)}\n`;
//       m3uContents.push(movieEntry);
//     }
//   });

//   // Write the updated contents back to the m3u file
//   fs.writeFileSync(m3uFilePath, m3uContents.join('\n'));
// }

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
    }" group-title="Movies",${
      movie.title
    }\nhttp://192.168.0.136:3000/streamed-movies/${encodeURIComponent(
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
      console.log(`Invalid magnet link for ${query}`);
      return null;
    }

    return magnetLink;
  } catch (error) {
    console.error(`Error searching torrent for ${query}:`, error);
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
  console.log(`Torrent URL: ${torrentInfo}`);

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
  const torrentAdded = webTorrentClient.add(
    torrentUrl,
    { path: downloadPath }, // Set the path to the desired download directory
    (torrent) => {
      console.log(`Downloading: ${torrent.name}`);

      const download = {
        title: torrent.name,
      };
      activeDownloads.push(download);

      let lastReportedPercentage = -1;

      torrent.on("download", () => {
        const currentPercentage = Math.floor(torrent.progress * 100);
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
        removeDownload(torrent.name);
      });
    }
  );

  res.status(202).json({ message: "Download started" });
});

async function downloadPopularMovies() {
  if (popularMovies.length === 0) {
    return console.log("No popular movies available");
  }

  const movieDownloads = [];
  const allDownloadedMovies = getAllDownloadedMovies();

  for (const movie of popularMovies) {
    const torrentName = movie.title;

    // Check if the movie is already downloading, exists in the downloaded list, or in the StreamedMovies directory
    if (
      isMovieDownloadingOrExists(torrentName) ||
      allDownloadedMovies.some((m) => m.title === torrentName)
    ) {
      console.log(
        `Movie '${torrentName}' is already downloading or exists in 'StreamedMovies'. Skipping download.`
      );
      movieDownloads.push({
        title: torrentName,
        status: "Movie already downloading or exists",
      });
      continue;
    }

    // Search for the torrent for the popular movie title
    const torrentInfo = await searchTorrent(torrentName);
    console.log("Torrent Info:", torrentInfo);

    if (
      !torrentInfo ||
      torrentInfo.includes("0000000000000000000000000000000000000000")
    ) {
      console.log(`Invalid torrent info for ${torrentName}, skipping.`);
      continue;
    }

    if (torrentInfo) {
      // Add the torrent
      webTorrentClient.add(torrentInfo, { path: path }, (torrent) => {
        console.log(`Downloading: ${torrent.name}`);

        const download = {
          title: torrent.name,
        };
        activeDownloads.push(download);

        let lastReportedPercentage = -1;

        torrent.on("download", () => {
          const currentPercentage = Math.floor(torrent.progress * 100);
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
          removeDownload(torrent.name);

          // Find the downloaded movie's file path
          const allDownloadedMovies = getAllDownloadedMovies();
          let downloadedMovie = allDownloadedMovies.find(
            (m) => m.title === torrent.name
          );

          if (downloadedMovie) {
            downloadedMovie.poster = movie.poster;
          } else {
            console.log(
              `Downloaded movie not found for title: ${torrent.name}`
            );
          }

          console.log(downloadedMovie);
          if (downloadedMovie) {
            console.log("Movie", downloadedMovie);
            updateM3UFile(downloadedMovie);
          } else {
            console.log(
              `Could not find file path for downloaded movie: ${torrent.name}`
            );
          }
        });
      });
      movieDownloads.push({ title: torrentName, status: "Download started" });
    } else {
      movieDownloads.push({ title: torrentName, status: "Torrent not found" });
    }
  }

  console.log("Download requests initiated for popular movies", movieDownloads);
}

function removeDownload(title) {
  const index = activeDownloads.findIndex((d) => d.title === title);
  if (index !== -1) {
    activeDownloads.splice(index, 1);
  }
}
