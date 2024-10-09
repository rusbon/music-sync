# Jack web server project

## Goal
- synchronize playing audio on multiple device using web
- local server
- playback

## available on market
- Audio Relay
- sonobus
- jamulus

have you ever imagine hearing best sound, then you want to share it
/ play it on multiple device to feel its immersion

## Tools Use
<!-- - Jack Audio -->
- Web Assembly

## Architecture

## Step
- JS play audio
- time lagged controlled audio playback
- synchronization
- Multiple device playing audio sychronously
- Audio streaming
- API build
- Frontend
- Play session
- Audio processing
- audio compression mp3 to opus

## API
- sync
- load (stream audio)
- upload

### SSE
- start
- stop
- pause
- change
- sync


## Note
- preload audio
<!-- - negative sign on offset (ntp) -->
- Chrome and Firefox delay difference
- Client side delay (mobile, bluetooth earbuds)
- weird behaviour 200 ms delay sound more sychronous
- currentTime interval window

## Delay
- Trigger sync delay
- play element delay
- audio playback delay

### Fixme
- empty title & artists
- pause seek
- session create new

# Music Sync - Playing music synchronously on multiple devices

There are several reason
- Louder Sound
- Comparing sound produced from different devices
- More immersive sound. Good sound system reproduce sound with equal loudness across different frequency. this can be achieved by adjusting equalizer or using different speaker set. Many speaker have multiple membrane with different size. Each dedicated to produce different frequency range.

You can check it out here.

## Technicality & Challenge
I choose building this on website to avoid installation and compatibility for different devices

There are several challenge for building synchronized audio playback.
1. Clock Synchronization
For synchronization, this project implement algorithm used by Network Time Protocol (NTP). Basically by recording the time at packet sent, arrived at server, and then received back by client, we can measure time different between two system and packet round trip delay.

2. Audio Engine Implementation
Although using web ensure cross compatibility, different engine having different audio implementation. Music synchronization on the same browser engine works great. But when pairing with different engine, there is always a playback mismatch when played on different timestamp. I've plotted the time difference between firefox and chrome by using audacity software as a baseline to discover the exact timestamp its actually played.

  <!-- /**
   * chrome - audacity
   * 35   : 34.7    : -0.3
   * 62   : 61.114  : -0.9
   * 120  : 118.6   : -1.4
   * 169  : 168.8   : -0.2
   * 210  : 209.7   : -0.3
   * 240  : 238.7   : -1.3
   * 260  : 259.1   : -0.9
   * 265  : 263.9   : -1.1
   * 270  : 270.0   : 0
   * 275  : 273.9   : -1.1
   */

  /**
   * firefox - audacity
   * 35   : 34.4    : -0.6
   * 62   : 60.90   : -1.1
   * 120  : 118.2   : -1.8
   * 169  : 166.6   : -2.4
   */ -->

Checking above result, firefox seems to have linear result by having delay increases as time goes by. While chrome delay fluctuating, having no correlation with timestamp it being currently played. Unfortunately, analyzing different implementation on audio engine used by both browser is out of scope of this project and also different encoding and/or sampling rate used by music file can affect playback timing. The current solution is to running music sync on the same browser.

3. Playback delay
Playback delay caused by processing capability and audio transmission of each devices. This occured when using mobile devices or playing music with bluetooth speaker/earbuds. While this will cause synchronization issue, the delay was constant and can be easily fixed by manually adjusting delay compensation and it just needs to be configured once.