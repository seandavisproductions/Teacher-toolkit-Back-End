// socketHandlers/objective.js

// In-memory store for objectives (this will still be lost on server restart)
const activeObjectives = {};

module.exports = (io) => {
    // This function will be called from your main server file
    // and passed the `io` instance.

    /**
     * Handles Socket.IO objective-related events.
     * @param {Socket} socket The client socket.
     * @param {string} sessionCode The session code the client is part of.
     */
    const handleObjectiveEvents = (socket, sessionCode) => {
        // When a client joins, send them the current objective for their session
        if (activeObjectives[sessionCode]) {
            socket.emit('objectiveUpdate', activeObjectives[sessionCode]);
            console.log(`Sent existing objective for ${sessionCode}: "${activeObjectives[sessionCode]}" to ${socket.id}`);
        } else {
            // If no objective is set, send an empty string
            socket.emit('objectiveUpdate', "");
        }

        // Event for the teacher to set/update the objective
        socket.on('setObjective', ({ sessionCode: incomingSessionCode, objectiveText }) => {
            // Ensure the sessionCode matches the one the socket is in, or handle as needed
            // For simplicity, we'll assume it always matches here, but a robust app
            // would verify permissions/session membership.
            if (incomingSessionCode === sessionCode) {
                console.log(`Teacher in session ${sessionCode} set objective: "${objectiveText}"`);
                activeObjectives[sessionCode] = objectiveText; // Store in memory

                // Emit the objective text to all clients in that session room
                io.to(sessionCode).emit('objectiveUpdate', objectiveText);
            } else {
                console.warn(`Attempt to set objective for mismatching session: ${incomingSessionCode} by socket in ${sessionCode}`);
            }
        });

        // You might want a 'clearObjective' event if needed
        // socket.on('clearObjective', (incomingSessionCode) => {
        //     if (incomingSessionCode === sessionCode) {
        //         delete activeObjectives[sessionCode];
        //         io.to(sessionCode).emit('objectiveUpdate', "");
        //         console.log(`Objective for session ${sessionCode} cleared.`);
        //     }
        // });
    };

    return { handleObjectiveEvents };
};