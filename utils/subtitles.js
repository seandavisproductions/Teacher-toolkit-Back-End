// utils/subtitles.js

const { SpeechClient } = require('@google-cloud/speech');
const { TranslationServiceClient } = require('@google-cloud/translate');
// You may also need @google-cloud/text-to-speech if you intend to use TTS in the future
// const { TextToSpeechClient } = require('@google-cloud/text-to-speech');


// Use the environment variable to get the Google Cloud credentials JSON string
const googleCredentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

// Ensure credentials are set, otherwise the server cannot start or use Google Cloud APIs
if (!googleCredentialsJson) {
    console.error('ERROR: GOOGLE_CREDENTIALS_JSON environment variable is not set!');
    console.error('Please set this variable with the full JSON content of your Google Cloud service account key file.');
    // Exit the process, as the core functionality won't work without credentials
    process.exit(1);
}

// Parse the JSON string into an object
let credentials;
try {
    credentials = JSON.parse(googleCredentialsJson);
} catch (e) {
    console.error('ERROR: Failed to parse GOOGLE_CREDENTIALS_JSON. Ensure it is valid JSON:', e);
    // Exit the process if the JSON is malformed
    process.exit(1);
}

// Initialize Google Cloud clients with the parsed credentials
const speechClient = new SpeechClient({ credentials: credentials });
const translationClient = new TranslationServiceClient({ credentials: credentials });
// If using Text-to-Speech:
// const textToSpeechClient = new TextToSpeechClient({ credentials: credentials });

const projectId = credentials.project_id; // Get project ID from credentials for translation API

// In-memory store for active speech recognition streams per session
// sessionStreams = { sessionCode: { socketId: { stream: recognizeStream, lastChunkTime: Date.now() } } }
const sessionStreams = {};

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
        let lastChunkTime = Date.now(); // To detect silence or end of speech

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

        // This event is emitted by the frontend when the teacher starts speech recognition
        socket.on('startRecognition', ({ languageCode }) => {
            console.log(`[SubtitleHandler] Socket ${socket.id} in session ${sessionCode} starting recognition for language: ${languageCode}`);

            // If a stream is already active for this socket, stop it first
            stopSpeechStream();

            // Configure the speech recognition request
            const request = {
                config: {
                    encoding: 'LINEAR16',         // Audio encoding from frontend (Int16Array)
                    sampleRateHertz: 16000,       // Sample rate from frontend microphone
                    languageCode: languageCode,   // Language user is speaking
                    // You might add enableWordTimeOffsets: true or other features here
                },
                interimResults: true,             // Enable partial results
                // Add this if you expect multiple speakers in one stream
                // enableSpeakerDiarization: true,
                // diarizationSpeakerCount: 2,
            };

            // Create a new streaming recognition stream
            currentSpeechStream = speechClient
                .streamingRecognize(request)
                .on('error', (err) => {
                    console.error(`[SubtitleHandler] Google Cloud Speech API Error for socket ${socket.id}:`, err.details || err.message || err);
                    // Emit a more descriptive error if possible, but default to generic
                    let errorMessage = 'Speech recognition error.';
                    if (err.code === 7) { // UNAUTHENTICATED or PERMISSION_DENIED (GRPC status code 7)
                        errorMessage = 'Authentication/Permission error with Google Cloud Speech API. Check service account roles.';
                    } else if (err.code === 3) { // INVALID_ARGUMENT (GRPC status code 3)
                        errorMessage = 'Invalid audio input or configuration. Ensure audio format (LINEAR16, 16000Hz) matches backend.';
                    }
                    socket.emit('subtitleError', errorMessage);
                    stopSpeechStream(); // Stop the stream on error
                })
                .on('data', async (data) => {
                    if (data.results[0] && data.results[0].alternatives[0]) {
                        const transcript = data.results[0].alternatives[0].transcript;
                        const isFinal = data.results[0].isFinal;

                        console.log(`[SubtitleHandler] Transcript (${languageCode}, Final: ${isFinal}): ${transcript}`);

                        // Emit the raw transcript to all clients in the session
                        io.to(sessionCode).emit('subtitle', {
                            text: transcript,
                            language: languageCode,
                            isFinal: isFinal,
                            translation: null // Will be filled by translation below if performed
                        });

                        // Translate the final transcript
                        if (isFinal) {
                            // You can adjust this to fetch desired languages dynamically from a database
                            // or from client requests, or broadcast to common languages.
                            // For this example, let's translate to English and Spanish.
                            const targetLanguagesToTranslate = ['en', 'es']; // Example target languages

                            for (const targetLanguage of targetLanguagesToTranslate) {
                                // Only translate if the target language is different from the source
                                if (targetLanguage !== languageCode) {
                                    try {
                                        const [response] = await translationClient.translateText({
                                            parent: `projects/${projectId}/locations/global`, // or your specific region, e.g., 'us-central1'
                                            contents: [transcript],
                                            sourceLanguageCode: languageCode,
                                            targetLanguageCode: targetLanguage,
                                        });

                                        const translatedText = response.translations[0].translatedText;
                                        console.log(`[SubtitleHandler] Translated to ${targetLanguage}: ${translatedText}`);

                                        // Emit the original text along with the specific translation
                                        io.to(sessionCode).emit('subtitle', {
                                            text: transcript,
                                            language: languageCode,
                                            isFinal: isFinal,
                                            translation: {
                                                text: translatedText,
                                                language: targetLanguage
                                            }
                                        });

                                    } catch (translateErr) {
                                        console.error(`[SubtitleHandler] Google Cloud Translation API Error for socket ${socket.id} (target: ${targetLanguage}):`, translateErr.details || translateErr.message || translateErr);
                                        // You might emit a specific 'translationError' to the client here if needed
                                    }
                                }
                            }
                        }
                    }
                });

            // Store the stream reference for this socket
            sessionStreams[sessionCode][socket.id] = {
                stream: currentSpeechStream,
                lastChunkTime: Date.now()
            };
        });

        // This event receives audio chunks from the frontend
        socket.on('audioChunk', (audioData) => {
            lastChunkTime = Date.now(); // Update last chunk time for this stream
            const streamInfo = sessionStreams[sessionCode][socket.id];

            if (streamInfo && streamInfo.stream) {
                // Write audio data (ArrayBuffer) to the streaming recognition stream
                streamInfo.stream.write(audioData);
            } else {
                console.warn(`[SubtitleHandler] Received audioChunk but no active stream for socket ${socket.id} in session ${sessionCode}.`);
                // This can happen if recognition hasn't started or stream was stopped/errored.
                // Consider adding logic here to prompt the frontend to re-initiate startRecognition if desired.
            }
        });

        // This event is emitted by the frontend when the teacher stops speech recognition
        socket.on('stopRecognition', () => {
            console.log(`[SubtitleHandler] Socket ${socket.id} in session ${sessionCode} stopping recognition.`);
            stopSpeechStream();
        });

        // Clean up on socket disconnect
        socket.on('disconnect', () => {
            console.log(`[SubtitleHandler] Socket ${socket.id} disconnected from session ${sessionCode}. Cleaning up stream.`);
            stopSpeechStream();
            // Remove socket's entry from sessionStreams if it exists
            if (sessionStreams[sessionCode]) {
                delete sessionStreams[sessionCode][socket.id];
                // If no more active streams in this session, clean up the session entry itself
                if (Object.keys(sessionStreams[sessionCode]).length === 0) {
                    delete sessionStreams[sessionCode];
                    console.log(`[SubtitleHandler] No more active subtitle streams for session ${sessionCode}. Cleaned up session entry.`);
                }
            }
        });

        // Optional: A global interval to check for silence and automatically stop streams
        // This is more advanced and requires careful management of multiple sessions/streams.
        // For simpler use cases, relying on `disconnect` and explicit `stopRecognition` is often sufficient.
    };

    // Export the handler function
    return { handleSubtitleEvents };
};