import { useRef, useImperativeHandle, useState } from 'preact/hooks'
import { TargetedEvent, forwardRef } from 'preact/compat'
import { WHIPClient } from '@binbat/whip-whep/whip'

import { formatVideoTrackResolution } from './utils'
import { useLogger } from './use-logger'

interface Props {
    onStop(): void
}

export interface IWebStreamDialog {
    show(resourceId: string): void
}

export const WebStreamDialog = forwardRef<IWebStreamDialog, Props>((props, ref) => {
    const [resourceId, setResourceId] = useState('')
    const [mediaStream, setMediaStream] = useState<MediaStream | null>()
    const [whipClient, setWhipClient] = useState<WHIPClient | null>()
    const [connState, setConnState] = useState('')
    const [videoResolution, setVideoResolution] = useState('')
    const logger = useLogger()
    const refDialog = useRef<HTMLDialogElement>(null)
    const refVideo = useRef<HTMLVideoElement>(null)

    useImperativeHandle(ref, () => {
        return {
            show: (resourceId: string) => {
                setResourceId(resourceId)
                refDialog.current?.showModal()
            }
        }
    })

    const handleCloseDialog = () => {
        refDialog.current?.close()
    }

    const updateConnState = (state: string) => {
        setConnState(state)
        logger.log(state)
    }

    const handleStreamStart = async () => {
        logger.clear()
        logger.log('started')
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
        })
        setMediaStream(stream)
        if (refVideo.current) {
            refVideo.current.srcObject = stream
        }
        const videoTrack = stream.getVideoTracks()[0]
        setVideoResolution(formatVideoTrackResolution(videoTrack))
        const pc = new RTCPeerConnection()
        pc.addEventListener('iceconnectionstatechange', () => {
            updateConnState(pc.iceConnectionState)
        })
        pc.addTransceiver(videoTrack, { direction: 'sendonly' })
        stream.getAudioTracks().forEach(track => pc.addTrack(track))
        const whipClient = new WHIPClient()
        const url = `${location.origin}/whip/${resourceId}`
        const token = ''
        // @ts-ignore
        whipClient.onAnswer = (sdp: RTCSessionDescription) => {
            logger.log('http answer received')
            return sdp
        }
        setWhipClient(whipClient)
        whipClient.publish(pc, url, token)
        logger.log('http offer sent')
    }

    const handleStreamStop = async () => {
        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop())
            setMediaStream(null)
        }
        if (refVideo.current) {
            refVideo.current.srcObject = null
        }
        if (whipClient) {
            await whipClient.stop()
            setWhipClient(null)
        }
        props.onStop()
        handleCloseDialog()
    }

    const handleVideoResize = (_: TargetedEvent<HTMLVideoElement>) => {
        const videoTrack = mediaStream?.getVideoTracks()[0]
        if (videoTrack) {
            setVideoResolution(formatVideoTrackResolution(videoTrack))
        }
    }

    return (
        <dialog ref={refDialog}>
            <h3>Web Stream {resourceId} {videoResolution}</h3>
            <div>
                <video ref={refVideo} controls autoplay onResize={handleVideoResize} style={{ maxWidth: '90vw', maxHeight: '70vh' }}></video>
            </div>
            <details>
                <summary>
                    <b>Connection Status: </b>
                    <code>{connState}</code>
                </summary>
                <pre className={'overflow-auto'} style={{ maxHeight: '10lh' }}>{logger.logs.join('\n')}</pre>
            </details>
            <div>
                <button onClick={() => { handleCloseDialog() }}>Hide</button>
                {whipClient
                    ? <button onClick={() => { handleStreamStop() }} style={{ color: 'red' }}>Stop</button>
                    : <button onClick={() => { handleStreamStart() }}>Start</button>
                }
            </div>
        </dialog>
    )
})
