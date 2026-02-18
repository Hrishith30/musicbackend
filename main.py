from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from ytmusicapi import YTMusic
import yt_dlp
import os

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Unofficial YouTube Music API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static files handled by GitHub Pages
# app.mount("/static", StaticFiles(directory="static"), name="static")


yt = YTMusic()

@app.get("/")
def read_root():
    return {"status": "online", "message": "Unofficial YouTube Music API is running"}


@app.get("/search")
def search(query: str, filter: str = Query(None, enum=["songs", "videos", "albums", "artists", "playlists", "community_playlists", "featured_playlists", "uploads"])):
    try:
        results = yt.search(query, filter=filter)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/home_content")
def get_home_content():
    try:
        # Note: get_home() often requires authentication for personalized results.
        # Without auth, it might return a standard home or fail. 
        # We'll try to return whatever it gives.
        home = yt.get_home()
        return home
    except Exception as e:
        # If it fails, return an empty list or handle gracefully
        print(f"Error fetching home: {e}")
        return []

@app.get("/artist/{artist_id}")
def get_artist(artist_id: str):
    try:
        artist = yt.get_artist(artist_id)
        return artist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/album/{album_id}")
def get_album(album_id: str):
    try:
        album = yt.get_album(album_id)
        return album
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/playlist/{playlist_id}")
def get_playlist(playlist_id: str):
    try:
        playlist = yt.get_playlist(playlist_id)
        return playlist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/radio/{video_id}")
def get_radio(video_id: str):
    try:
        # get_watch_playlist returns a dict with 'tracks', 'playlistId', etc.
        # We just want the tracks.
        watch_playlist = yt.get_watch_playlist(videoId=video_id, limit=20)
        return watch_playlist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/play/{video_id}")
def get_stream_url(video_id: str):
    # Expanded Waterfall: Try everything to bypass blocks & format errors
    strategies = [
        # 1. TV Client (Often bypasses IP blocks without cookies)
        {"format": "bestaudio/best", "use_cookies": False, "client": "tv", "title": "TV-NoCookies"},
        
        # 2. Web Embedded with cookies (Often different format availability)
        {"format": "bestaudio/best", "use_cookies": True, "client": "web_embedded", "title": "WebEmbedded+Cookies"},
        
        # 3. iOS Client with cookies (Robust authenticated fallback)
        {"format": "bestaudio/best", "use_cookies": True, "client": "ios", "title": "iOS+Cookies"},
        
        # 4. Android Client WITHOUT cookies (Another unauthenticated bypass)
        {"format": "bestaudio/best", "use_cookies": False, "client": "android", "title": "Android-NoCookies"},
        
        # 5. Standard with cookies (Our baseline authenticated)
        {"format": "bestaudio/best", "use_cookies": True, "title": "Standard+Cookies"},
        
        # 6. Absolute fallback (Try anything without cookies)
        {"format": "bestaudio/best", "use_cookies": False, "title": "Standard-NoCookies"},
    ]

    errors = []
    cookies_present = False
    cookies_content = os.getenv("YOUTUBE_COOKIES")
    
    if cookies_content:
        cookies_present = True
        print(f"Cookies from ENV: {len(cookies_content)} chars")
    elif os.path.exists("cookies.txt"):
        cookies_present = True
        print("Cookies from FILE present")

    for strategy in strategies:
        # Skip authenticated strategies if no cookies available
        if strategy.get("use_cookies") and not cookies_present:
            continue

        try:
            ydl_opts = {
                'format': strategy['format'],
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'noplaylist': True,
            }
            
            # Setup client spoofing
            if strategy.get("client") == "tv":
                ydl_opts['extractor_args'] = {'youtube': {'player_client': ['tv']}}
            elif strategy.get("client") == "ios":
                ydl_opts['extractor_args'] = {'youtube': {'player_client': ['ios']}}
                ydl_opts['user_agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
            elif strategy.get("client") == "android":
                ydl_opts['extractor_args'] = {'youtube': {'player_client': ['android']}}
            elif strategy.get("client") == "web_embedded":
                ydl_opts['extractor_args'] = {'youtube': {'player_client': ['web_embedded']}}

            # Setup cookies
            if strategy.get("use_cookies"):
                if cookies_content:
                    temp_cookies_path = "/tmp/cookies.txt" if os.name != 'nt' else "temp_cookies.txt"
                    with open(temp_cookies_path, "w", encoding="utf-8") as f:
                        f.write(cookies_content)
                    ydl_opts['cookiefile'] = temp_cookies_path
                elif os.path.exists("cookies.txt"):
                    ydl_opts['cookiefile'] = 'cookies.txt'

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if info and 'url' in info:
                    print(f"Extraction success using {strategy['title']}")
                    return {"url": info['url'], "title": info.get('title'), "duration": info.get('duration'), "strategy": strategy['title']}
                
        except Exception as e:
            # Get the exact error message fromyt-dlp
            err_str = str(e).split('\n')[0] # Get first line of error
            error_msg = f"{strategy['title']} failed: {err_str}"
            print(error_msg)
            errors.append(error_msg)

    # Final attempt: List all formats and pick ANY that has a URL
    try:
        ydl_opts = {'quiet': True, 'nocheckcertificate': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            for f in info.get('formats', []):
                if f.get('url'):
                    print("Emergency fallback success")
                    return {"url": f['url'], "title": info.get('title'), "strategy": "EmergencyFallback"}
    except Exception as e:
        errors.append(f"EmergencyFallback failed: {str(e).split('\n')[0]}")

    raise HTTPException(status_code=500, detail={
        "message": "All extraction strategies failed",
        "errors": errors,
        "cookies_detected": cookies_present
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
