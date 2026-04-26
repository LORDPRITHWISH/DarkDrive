"use client"

import "@videojs/react/video/skin.css"
import "./dark-player.css"
import { createPlayer, videoFeatures } from "@videojs/react"
import { VideoSkin, Video } from "@videojs/react/video"
import { forwardRef } from "react"

const Player = createPlayer({ features: videoFeatures })

interface DarkPlayerProps {
  src: string
  className?: string
}

export const DarkPlayer = forwardRef<HTMLVideoElement, DarkPlayerProps>(
  ({ src, className }, ref) => {
    if (!src) {
      return (
        <div className="dark-player-wrapper">
          <div className="dark-player-loading">
            <div className="dark-player-loading__spinner" />
          </div>
        </div>
      )
    }

    return (
      <div className={`dark-player-wrapper ${className || ""} `}>
        <Player.Provider>
          <Player.Container>
            <VideoSkin>
              <Video
                ref={ref}
                src={src}
                className="h-full w-full object-contain"
                playsInline
                // controls
                // autoPlay
              />
            </VideoSkin>
          </Player.Container>
        </Player.Provider>
      </div>
    )
  }
)

DarkPlayer.displayName = "DarkPlayer"
