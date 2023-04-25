const path = require('path');
const express = require('express')
//const http = require('http')
const moment = require('moment');
const socketio = require('socket.io');
const PORT = process.env.PORT || 3000;
const ysocketio= require("y-socket.io/dist/server").YSocketIO

const http = require('https');
const fs = require('fs');


// Yes, TLS is required
const serverConfig = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};

const app = express();
const server = http.createServer(serverConfig, app);

const io = socketio(server);

//initialize YJS document synchronization library over socketIO
const YSocketIO=new ysocketio(io)
YSocketIO.initialize()


app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let socketroom = {};
let socketname = {};
let micSocket = {};
let videoSocket = {};
let roomBoard = {};
let docs={};
let cursors=[];


io.on('connect', socket => {

    socket.on("join room", (roomid, username) => {

        socket.join(roomid);
        socketroom[socket.id] = roomid;
        socketname[socket.id] = username;
        micSocket[socket.id] = 'on';
        videoSocket[socket.id] = 'on';

        if (rooms[roomid] && rooms[roomid].length > 0) {
            rooms[roomid].push(socket.id);
            socket.to(roomid).emit('message', `${username} joined the room.`, 'Bot', moment().format(
                "h:mm a"
            ));
            io.to(socket.id).emit('join room', rooms[roomid].filter(pid => pid != socket.id), socketname, micSocket, videoSocket,docs[roomid]);
        }
        else {
            rooms[roomid] = [socket.id];
            io.to(socket.id).emit('join room', null, null, null, null,null);
        }

        io.to(roomid).emit('user count', rooms[roomid].length);
        
    });

    socket.on('action', msg => {
        if (msg == 'mute')
            micSocket[socket.id] = 'off';
        else if (msg == 'unmute')
            micSocket[socket.id] = 'on';
        else if (msg == 'videoon')
            videoSocket[socket.id] = 'on';
        else if (msg == 'videooff')
            videoSocket[socket.id] = 'off';

        socket.to(socketroom[socket.id]).emit('action', msg, socket.id);
    })

    socket.on('video-offer', (offer, sid) => {
        socket.to(sid).emit('video-offer', offer, socket.id, socketname[socket.id], micSocket[socket.id], videoSocket[socket.id]);
    })

    socket.on('video-answer', (answer, sid) => {
        socket.to(sid).emit('video-answer', answer, socket.id);
    })

    socket.on('new icecandidate', (candidate, sid) => {
        socket.to(sid).emit('new icecandidate', candidate, socket.id);
    })

    socket.on('message', (msg, username, roomid) => {
        io.to(roomid).emit('message', msg, username, moment().format(
            "h:mm a"
        ));
    })

    socket.on('getCanvas', () => {
        if (roomBoard[socketroom[socket.id]])
            socket.emit('getCanvas', roomBoard[socketroom[socket.id]]);
    });

    socket.on('draw', (newx, newy, prevx, prevy, color, size) => {
        socket.to(socketroom[socket.id]).emit('draw', newx, newy, prevx, prevy, color, size);
    })

    socket.on('clearBoard', () => {
        socket.to(socketroom[socket.id]).emit('clearBoard');
    });

    socket.on('store canvas', url => {
        roomBoard[socketroom[socket.id]] = url;
    })

    socket.on('disconnect', () => {
        if (!socketroom[socket.id]) return;
        socket.to(socketroom[socket.id]).emit('message', `${socketname[socket.id]} left the chat.`, `Bot`, moment().format(
            "h:mm a"
        ));
        socket.to(socketroom[socket.id]).emit('remove peer', socket.id);
        var index = rooms[socketroom[socket.id]].indexOf(socket.id);
        rooms[socketroom[socket.id]].splice(index, 1);
        io.to(socketroom[socket.id]).emit('user count', rooms[socketroom[socket.id]].length);
        console.log('--------------------');

        if(rooms[socketroom[socket.id]]==undefined){               //remove document info and cursor locations when room has emptied
            cursors=cursors.filter(cursor=>cursor.roomid!==socketroom[socket.id])
            delete docs[socketroom[socket.id]]
        }else{
            if(cursors.some((cursor)=>cursor.socketID===socket.id)){            //if a user exits but the room still exists
                socket.to(socketroom[socket.id]).emit('remove user cursor',cursors.find((cursor)=>cursor.socketID===socket.id).id)          //find cursor info and broadcast it to other users to remove it
                cursors=cursors.filter((cursor)=>cursor.socketID!==socket.id)       //also remove it from cursors array
            }

        }
        
        delete socketroom[socket.id];

        //toDo: push socket.id out of rooms
    });

    //when room gets created, store new document data to emit to other users
    socket.on('store-doc',(docData)=>{
        const {doc,type,provider,roomid}=docData;
        docs[roomid]={doc,type,provider};
        
    })

    //for every user change in the editor, this event tracks the new pointer location in the editor
    //and emits it to all the other users in the room in order to support multiple cursors
    socket.on('cursor location',(roomid,id,range,oldRange)=>{
        if(cursors.find(cursor=>cursor.id===id) && range!==oldRange){               //if the cursor exists already and we have a new location
            cursors=cursors.map(cursor=>cursor.id===id?{roomid,id,range,socketID:socket.id}:cursor)         //alter cursors array with the new location
        }else{                                                                      //register new cursor if a user has just started using the editor
            cursors.push({roomid,id,range,socketID:socket.id})
        }

        if(range!==oldRange){                                                   //send the new location to the other users
            socket.to(socketroom[socket.id]).emit('update cursors',cursors.filter(cursor=>cursor.roomid===roomid))
        }
    })

    
})


server.listen(PORT, () => console.log(`Server is up and running on port ${PORT}`));