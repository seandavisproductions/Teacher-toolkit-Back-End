// socketHandlers/subtitle.js
const speech = require('@google-cloud/speech');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1; // v3beta1 or v2 depending on your project
const { TextToSpeechClient } = require('@google-cloud/text-to-speech'); // Optional: if you want audio translation

// Initialize Google Cloud clients
const speechClient = new speech.SpeechClient();
const translationClient = new TranslationServiceClient();
const textToSpeechClient = new TextToSpeechClient(); // Optional

// projectId for Google Cloud Translation (replace with your actual project ID)
const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID; // Ensure this is set in your .env

// Configuration for streaming recognition
const request = {
    config: {
        encoding: 'LINEAR16', // Or 'OGG_OPUS', 'FLAC', etc. depending on frontend audio format
        sampleRateHertz: 16000, // Important: Match frontend audio sample rate
        languageCode: 'en-US', // Default recognition language (teacher's language)
        // You might need to adjust this dynamically based on teacher's input
    },
    interimResults: true, // Get results while the speaker is talking
};

// In-memory store for current subtitle text and STT stream per session
const activeSubtitles = {}; // Stores the last complete transcribed text
const recognitionStreams = {}; // Stores active STT streams

module.exports = (io) => {
    /**
     * Handles Socket.IO subtitle-related events.
     * @param {Socket} socket The client socket.
     * @param {string} sessionCode The session code the client is part of.
     */
    const handleSubtitleEvents = (socket, sessionCode) => {

        // When a client joins, send them the current subtitle text
        if (activeSubtitles[sessionCode]) {
            socket.emit('subtitleUpdate', activeSubtitles[sessionCode]);
            console.log(`Sent existing subtitle for ${sessionCode}: "${activeSubtitles[sessionCode]}" to ${socket.id}`);
        }

        // Teacher starts streaming audio
        socket.on('startSpeechRecognition', (teacherLangCode) => {
            console.log(`Teacher in session ${sessionCode} started speech recognition with language: ${teacherLangCode}`);

            if (recognitionStreams[sessionCode]) {
                recognitionStreams[sessionCode].end(); // End previous stream if exists
                delete recognitionStreams[sessionCode];
            }

            // Create a new stream recognition request for this session
            const currentRequest = { ...request };
            currentRequest.config.languageCode = teacherLangCode || 'en-US'; // Use teacher's selected language

            const recognizeStream = speechClient
                .streamingRecognize(currentRequest)
                .on('error', (error) => {
                    console.error('Speech-to-Text Stream Error:', error);
                    // Inform the teacher/session of the error
                    io.to(sessionCode).emit('subtitleError', 'Speech recognition error.');
                })
                .on('data', (data) => {
                    if (data.results[0] && data.results[0].alternatives[0]) {
                        const transcript = data.results[0].alternatives[0].transcript;
                        const isFinal = data.results[0].isFinal;

                        // Broadcast the transcript to all clients in the session
                        // Send as a structured object including whether it's final
                        io.to(sessionCode).emit('subtitleUpdate', { text: transcript, isFinal: isFinal });
                        // console.log(`[${sessionCode}] Transcript (${isFinal ? 'Final' : 'Interim'}): ${transcript}`);

                        if (isFinal) {
                            activeSubtitles[sessionCode] = transcript; // Store the last final transcript
                            // You might want to reset the stream here if you want new sentences
                            // recognitionStreams[sessionCode].end();
                            // delete recognitionStreams[sessionCode];
                            // Re-start stream if continuous input is expected
                        }
                    }
                });

            recognitionStreams[sessionCode] = recognizeStream; // Store the active stream
        });

        // Teacher sends audio chunks
        socket.on('audioChunk', (audioData) => {
            if (recognitionStreams[sessionCode]) {
                recognitionStreams[sessionCode].write(audioData);
            }
        });

        // Teacher stops streaming audio
        socket.on('stopSpeechRecognition', () => {
            console.log(`Teacher in session ${sessionCode} stopped speech recognition.`);
            if (recognitionStreams[sessionCode]) {
                recognitionStreams[sessionCode].end();
                delete recognitionStreams[sessionCode];
            }
        });

        // Student requests translation
        socket.on('requestTranslation', async ({ text, targetLanguageCode }) => {
            if (!text || !targetLanguageCode) {
                console.warn('Invalid translation request:', { text, targetLanguageCode });
                return;
            }

            try {
                // Determine source language (could be dynamic, but assuming en-US for this example)
                const sourceLanguageCode = request.config.languageCode; // Or derive from `activeSubtitles` history

                const [response] = await translationClient.translateText({
                    parent: `projects/${GOOGLE_CLOUD_PROJECT_ID}/locations/global`, // 'global' for most general models
                    contents: [text],
                    targetLanguageCode: targetLanguageCode,
                    sourceLanguageCode: sourceLanguageCode, // Important for accurate translation
                });

                const translatedText = response.translations[0].translatedText;
                socket.emit('translatedSubtitle', translatedText); // Send back to the requesting student only
                // console.log(`Translated "${text}" to ${targetLanguageCode}: "${translatedText}"`);

            } catch (error) {
                console.error('Translation Error:', error);
                socket.emit('subtitleError', 'Translation service error.');
            }
        });

        // Handle disconnect cleanup for active streams
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
            // Clean up recognition stream if the teacher disconnects
            if (recognitionStreams[sessionCode] && socket.id === Object.keys(io.sockets.adapter.rooms.get(sessionCode) || {}).find(id => recognitionStreams[sessionCode]._readableState.pipes[0].id === id)) {
                // This check is very simplistic; you'd need a more robust way to identify the "teacher" socket
                // e.g., by storing teacher's socket ID when they start recognition.
                recognitionStreams[sessionCode].end();
                delete recognitionStreams[sessionCode];
                console.log(`Speech recognition stream ended for session ${sessionCode} due to teacher disconnect.`);
            }
        });
    };

    return { handleSubtitleEvents };
};