// utils/subtitles.js

const { SpeechClient } = require('@google-cloud/speech');
const { TranslationServiceClient } = require('@google-cloud/translate');

// Use the environment variable to get the Google Cloud credentials JSON string
const googleCredentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

// Ensure credentials are set, otherwise the server cannot start or use Google Cloud APIs
if (!googleCredentialsJson) {
    console.error('ERROR: GOOGLE_CREDENTIALS_JSON environment variable is not set!');
    console.error('Please set this variable with the full JSON content of your Google Cloud service account key file.');
    process.exit(1);
}

// Parse the JSON string into an object
let credentials;
try {
    credentials = JSON.parse(googleCredentialsJson);
} catch (e) {
    console.error('ERROR: Failed to parse GOOGLE_CREDENTIALS_JSON. Ensure it is valid JSON:', e);
    process.exit(1);
}

// Initialize Google Cloud clients with the parsed credentials
const speechClient = new SpeechClient({ credentials: credentials });
const translationClient = new TranslationServiceClient({ credentials: credentials });

const projectId = credentials.project_id; // Get project ID from credentials for translation API

// In-memory store for active speech recognition streams per session
const sessionStreams = {}; // sessionStreams = { sessionCode: { socketId: { stream: recognizeStream, lastChunkTime: Date.now() } } }

module.exports = (io) => {
    /**
     * Handles Socket.IO subtitle-related events.
     * @param {Socket} socket The client socket.
     * @param {string} sessionCode The session code the client is part of.
     */
    const handleSubtitleEvents = (socket, sessionCode) => {
        // Ensure the session entry exists
        if (!sessionStreams[sessionCode]) {
            sessionStreams[sessionCode] = {};
        }

        let currentSpeechStream = null; // The active streamingRecognize stream for this socket
        // let lastChunkTime = Date.now(); // Not strictly needed here, managed by stream lifecycle

        // Helper function to stop the current stream and clean up
        const stopSpeechStream = () => {
            if (currentSpeechStream) {
                console.log(`[SubtitleHandler] Ending speech stream for socket ${socket.id} in session ${sessionCode}`);
                currentSpeechStream.end(); // End the Google Cloud stream
                currentSpeechStream = null;
            }
            if (sessionStreams[sessionCode] && sessionStreams[sessionCode][socket.id]) {
                delete sessionStreams[sessionCode][socket.id]; // Clean up from our store
            }
        };

        // --- Event: startRecognition (from Teacher client) ---
        socket.on('startRecognition', ({ languageCode }) => {
            console.log(`[SubtitleHandler] Socket ${socket.id} in session ${sessionCode} starting recognition for language: ${languageCode}`);

            stopSpeechStream(); // Stop any existing stream for this socket

            const request = {
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: 16000,
                    languageCode: languageCode,
                },
                interimResults: true,
            };

            currentSpeechStream = speechClient
                .streamingRecognize(request)
                .on('error', (err) => {
                    console.error(`[SubtitleHandler] Google Cloud Speech API Error for socket ${socket.id}:`, err.details || err.message || err);
                    let errorMessage = 'Speech recognition error.';
                    if (err.code === 7) {
                        errorMessage = 'Authentication/Permission error with Google Cloud Speech API. Check service account roles.';
                    } else if (err.code === 3) {
                        errorMessage = 'Invalid audio input or configuration. Ensure audio format (LINEAR16, 16000Hz) matches backend.';
                    }
                    socket.emit('subtitleError', errorMessage);
                    stopSpeechStream();
                })
                .on('data', async (data) => {
                    if (data.results[0] && data.results[0].alternatives[0]) {
                        const transcript = data.results[0].alternatives[0].transcript;
                        const isFinal = data.results[0].isFinal;
                        const detectedLanguage = languageCode; // Use the requested language as detected for now

                        console.log(`[SubtitleHandler] Transcript (${detectedLanguage}, Final: ${isFinal}): ${transcript}`);

                        // --- Emit the main subtitle event to all clients in the session ---
                        // CHANGED EVENT NAME: 'subtitle' instead of 'subtitleUpdate'
                        io.to(sessionCode).emit('subtitle', {
                            text: transcript,
                            language: detectedLanguage, // Send the original detected language
                            isFinal: isFinal,
                            translation: null // For now, client requests specific translations
                        });

                        // No longer doing proactive broadcast translation here to reduce API calls
                        // Students will request their specific translations on demand.
                        // If you *do* want to pre-translate common languages, keep the loop here,
                        // but ensure it doesn't conflict with student-specific requests.
                        // For a leaner approach, move all translation to `requestStudentTranslation`
                        // if only students need translations.
                    }
                });

            sessionStreams[sessionCode][socket.id] = {
                stream: currentSpeechStream,
                // lastChunkTime: Date.now() // Not strictly needed for Google Cloud streams as they handle timeouts
            };
        });

        // --- Event: audioChunk (from Teacher client) ---
        socket.on('audioChunk', (audioData) => {
            // lastChunkTime = Date.now(); // Not strictly needed, Google Cloud stream handles
            const streamInfo = sessionStreams[sessionCode][socket.id];

            if (streamInfo && streamInfo.stream) {
                streamInfo.stream.write(audioData);
            } else {
                console.warn(`[SubtitleHandler] Received audioChunk but no active stream for socket ${socket.id} in session ${sessionCode}.`);
            }
        });

        // --- Event: stopRecognition (from Teacher client) ---
        socket.on('stopRecognition', () => {
            console.log(`[SubtitleHandler] Socket ${socket.id} in session ${sessionCode} stopping recognition.`);
            stopSpeechStream();
        });

        // --- NEW Event: requestStudentTranslation (from Student client) ---
        socket.on('requestStudentTranslation', async ({ text, sourceLanguageCode, targetLanguageCode }) => {
            console.log(`[SubtitleHandler] Socket ${socket.id} requesting translation for "${text}" from ${sourceLanguageCode} to ${targetLanguageCode}`);

            if (!text || !sourceLanguageCode || !targetLanguageCode) {
                console.warn('[SubtitleHandler] Invalid translation request data from student.');
                socket.emit('subtitleError', 'Invalid translation request. Missing text, source, or target language.');
                return;
            }

            try {
                const [response] = await translationClient.translateText({
                    parent: `projects/${projectId}/locations/global`, // Adjust if your Translation API is regional
                    contents: [text],
                    sourceLanguageCode: sourceLanguageCode,
                    targetLanguageCode: targetLanguageCode,
                });

                const translatedText = response.translations[0].translatedText;
                console.log(`[SubtitleHandler] Translated to ${targetLanguageCode} for socket ${socket.id}: ${translatedText}`);

                // --- Emit the translated text back ONLY to the requesting student ---
                // NEW EVENT NAME: 'translatedSubtitleResponse'
                socket.emit('translatedSubtitleResponse', translatedText);

            } catch (translateErr) {
                console.error(`[SubtitleHandler] Google Cloud Translation API Error for socket ${socket.id} (target: ${targetLanguageCode}):`, translateErr.details || translateErr.message || translateErr);
                socket.emit('subtitleError', `Failed to translate to ${targetLanguageCode}.`);
            }
        });


        // --- Clean up on socket disconnect ---
        socket.on('disconnect', () => {
            console.log(`[SubtitleHandler] Socket ${socket.id} disconnected from session ${sessionCode}. Cleaning up stream.`);
            stopSpeechStream();
            if (sessionStreams[sessionCode]) {
                delete sessionStreams[sessionCode][socket.id];
                if (Object.keys(sessionStreams[sessionCode]).length === 0) {
                    delete sessionStreams[sessionCode];
                    console.log(`[SubtitleHandler] No more active subtitle streams for session ${sessionCode}. Cleaned up session entry.`);
                }
            }
        });
    };

    return { handleSubtitleEvents };
};