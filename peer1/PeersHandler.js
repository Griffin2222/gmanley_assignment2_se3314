let net = require("net"),
  kadPTPpacket = require("./kadPTPmessage"),
  singleton = require("./Singleton");

let myReceivingPort = null;
let mySendingPort = null;

let peersList = [];

module.exports = {
  handleClientJoining: function (sock, serverDHTtable) {
    // accept anyways in this assignment
    handleClient(sock, serverDHTtable);

  },
  handleCommunications: function (clientSocket, clientName, clientDHTtable) {
    communicate(clientSocket, clientName, clientDHTtable)
  }
};

function handleClient(sock, serverDHTtable) {
  let kadPacket = null;
  let joiningPeerAddress = sock.remoteAddress + ":" + sock.remotePort;

  // Triggered only when the client is sending kadPTP message
  sock.on('data', (message) => {
    kadPacket = parseMessage(message);
  });

  sock.on('end', () => {
    if (kadPacket) {
      if (kadPacket.msgType == 2) {
        console.log("Received Hello Message from " + kadPacket.senderName + " " + kadPacket.peersList[0].peerID);
        if (kadPacket.peersList.length > 0) {
          let output = "  along with DHT: ";
          for (let i = 0; i < kadPacket.peersList.length; i++) {
            if (kadPacket.peersList[i].peerIP !== "0.0.0.0") {
              output +=
                "[" +
                kadPacket.peersList[i].peerIP + ":" +
                kadPacket.peersList[i].peerPort + ", " +
                kadPacket.peersList[i].peerID +
                "]\n                  ";
            }
          }
          console.log(output);
        }
        let joiningPeerID = singleton.getPeerID(sock.remoteAddress, sock.remotePort);
        let joiningPeer = {
          peerName: kadPacket.senderName,
          peerIP: sock.remoteAddress,
          peerPort: sock.remotePort,
          peerID: joiningPeerID
      };
        // add the sender into the table only if it is not exist or set the name of the existing one
        let exist = serverDHTtable.table.find(e => e && e.node && e.node.peerPort == sock.remotePort);
        if (exist) {
          exist.node.peerName = kadPacket.senderName;
          pushBucket(serverDHTtable, joiningPeer);
        } else {
          console.log("Connected from peer " + joiningPeerAddress + "\n");
          pushBucket(serverDHTtable, joiningPeer);
          
        }
       

        // Now update the DHT table
        updateDHTtable(serverDHTtable, kadPacket.peersList);
      }
    } else {
      // This was a bootstrap request
      console.log("Connected from peer " + joiningPeerAddress + "\n");
      // add the requester info into server DHT table
      pushBucket(serverDHTtable, {
        peerName: "",
        peerIP: sock.remoteAddress,
        peerPort: sock.remotePort,
        peerID: singleton.getPeerID(sock.remoteAddress, sock.remotePort)
      });
      printDHT(serverDHTtable);
    }
  });

  if (kadPacket == null) {
    // This is a bootstrap request
    // send acknowledgment to the client
    kadPTPpacket.init(7, 1, serverDHTtable);
    sock.write(kadPTPpacket.getPacket());
    sock.end();
  }
}

function communicate(clientSocket, clientName, clientDHTtable) {
  let senderPeerID = singleton.getPeerID(clientSocket.remoteAddress, clientSocket.remotePort)

  clientSocket.on('data', (message) => {
    let kadPacket = parseMessage(message);

    let senderPeerName = kadPacket.senderName;
    let senderPeer = {
      peerName: senderPeerName,
      peerIP: clientSocket.remoteAddress,
      peerPort: clientSocket.remotePort,
      peerID: senderPeerID
    };

    if (kadPacket.msgType == 1) {
      // This message comes from the server
      console.log(
        "Connected to " +
        senderPeerName +
        ":" +
        clientSocket.remotePort +
        " at timestamp: " +
        singleton.getTimestamp() + "\n"
      );

      // Now run as a server
      myReceivingPort = clientSocket.localPort;
      let localPeerID = singleton.getPeerID(clientSocket.localAddress, myReceivingPort);
      let serverPeer = net.createServer();
      serverPeer.listen(myReceivingPort, clientSocket.localAddress);
      console.log(
        "This peer address is " +
        clientSocket.localAddress +
        ":" +
        myReceivingPort +
        " located at " +
        clientName +
        " [" + localPeerID + "]\n"
      );

      // Wait for other peers to connect
      serverPeer.on("connection", function (sock) {
        // again we will accept all connections in this assignment
        handleClient(sock, clientDHTtable);
      });

      console.log("Received Welcome message from " + senderPeerName + " " + "[" + senderPeerID + "]") + "\n";
      if (kadPacket.peersList.length > 0) {
        let output = "  along with DHT: ";
        for (var i = 0; i < kadPacket.peersList.length; i++) {
          if(kadPacket.peersList[i].peerIP != "0.0.0.0"){
          output +=
            "[" +
            kadPacket.peersList[i].peerIP + ":" +
            kadPacket.peersList[i].peerPort + ", " +
            kadPacket.peersList[i].peerID +
            "]\n                  ";
          }
        }
        console.log(output);
      } else {
        console.log("  along with DHT: []\n");
      }

      // add the bootstrap node into the DHT table but only if it is not exist already
      let exist = clientDHTtable.table.find(e => e.node.peerPort == clientSocket.remotePort);
      if (!exist) {
        pushBucket(clientDHTtable, senderPeer);
       // console.log("called in first if")
      } else {
        console.log(senderPeer.peerPort + " is exist already")
      }

      updateDHTtable(clientDHTtable, kadPacket.peersList)

    } else {
      // Later we will consider other message types.
      console.log("The message type " + kadPacket.msgType + " is not supported")
    }
  });

  clientSocket.on("end", () => {
    // disconnected from server
    sendHello(clientDHTtable)
  })
}

function printDHT(DHTtable){
  if (DHTtable.table.length > 0) {
    let output = "My DHT: ";
    for (let i = 0; i < DHTtable.table.length; i++) {
      if (DHTtable.table[i] && DHTtable.table[i].node && DHTtable.table[i].node.peerIP != "0.0.0.0") {
        output +=
          "[" +
          (i+1)+ ", "+
          DHTtable.table[i].node.peerIP + ":" +
          DHTtable.table[i].node.peerPort + ", " +
          DHTtable.table[i].node.peerID +
          "]\n        ";
       } 
      //else {
      //   console.log("Error: Missing node information in DHTtable at index " + i);
      // }
    }
    console.log(output);
  } else {
    console.log("DHTtable is empty.");
  }
}

function updateDHTtable(DHTtable, list) {
  // Refresh the local k-buckets using the transmitted list of peers. 
 
  refreshBucket(DHTtable, list);
  console.log("Refresh k-Bucket operation is performed.\n");

  if (DHTtable.table.length > 0) {
    let output = "My DHT: ";
    for (let i = 0; i < DHTtable.table.length; i++) {
      if (DHTtable.table[i] && DHTtable.table[i].node && DHTtable.table[i].node.peerIP != "0.0.0.0") {
        output +=
          "[" +
          (i+1)+ ", "+
          DHTtable.table[i].node.peerIP + ":" +
          DHTtable.table[i].node.peerPort + ", " +
          DHTtable.table[i].node.peerID +
          "]\n        ";
       } 
      //else {
      //   console.log("Error: Missing node information in DHTtable at index " + i);
      // }
    }
    console.log(output);
  } else {
    console.log("DHTtable is empty.");
  }

}


function parseMessage(message) {
  let kadPacket = {}
  peersList = [];
  let bitMarker = 0;
  kadPacket.version = parseBitPacket(message, 0, 4);
  bitMarker += 4;
  kadPacket.msgType = parseBitPacket(message, 4, 8);
  bitMarker += 8;
  let numberOfPeers = parseBitPacket(message, 12, 8);
  bitMarker += 8;
  let SenderNameSize = parseBitPacket(message, 20, 12);
  bitMarker += 12;
  kadPacket.senderName = bytes2string(message.slice(4, SenderNameSize + 4));
  bitMarker += SenderNameSize * 8;

  if (numberOfPeers > 0) {
    for (var i = 0; i < numberOfPeers; i++) {
      let firstOctet = parseBitPacket(message, bitMarker, 8);
      bitMarker += 8;
      let secondOctet = parseBitPacket(message, bitMarker, 8);
      bitMarker += 8;
      let thirdOctet = parseBitPacket(message, bitMarker, 8);
      bitMarker += 8;
      let forthOctet = parseBitPacket(message, bitMarker, 8);
      bitMarker += 8;
      let port = parseBitPacket(message, bitMarker, 16);
      bitMarker += 16;
      let IP = firstOctet + "." + secondOctet + "." + thirdOctet + "." + forthOctet;
      let peerID = singleton.getPeerID(IP, port);
      let aPeer = {
        peerIP: IP,
        peerPort: port,
        peerID: peerID
      };
      peersList.push(aPeer);
    }
  }
  kadPacket.peersList = peersList;
  return kadPacket;
}

function refreshBucket(T, peersList) {
  peersList.forEach(P => {
    pushBucket(T, P);
  });
}

// pushBucket method stores the peer’s information (IP address, port number, and peer ID) 
// into the appropriate k-bucket of the DHTtable. 


function pushBucket(T, P) {
  //console.log(P.version);
  if (T.owner.peerID !== P.peerID) {
    let localID = singleton.Hex2Bin(T.owner.peerID);
    let receiverID = singleton.Hex2Bin(P.peerID);
    let i = 0;
    // Count how many bits match
    for (i = 0; i < localID.length; i++) {
      if (localID[i] !== receiverID[i]) {
        break;
      }
    }

    // Determine the index of the k-bucket
    let index = i; // Ensure index doesn't exceed the array size

    let k_bucket = {
      prefix: i,
      node: P
    };

    if (P.peerIP !== "0.0.0.0") {
      let exist = T.table[index]; // Get the existing k-bucket at the index
      if (exist) {
        index2 = index + 1;
        console.log("Bucket P" + index2 + " is full, checking if we need to change the stored value");
        // Compare with existing peer and update if necessary
        if (singleton.XORing(localID, singleton.Hex2Bin(k_bucket.node.peerID)) <
          singleton.XORing(localID, singleton.Hex2Bin(exist.node.peerID))) {
          // Update the k-bucket with the new peer
          console.log("** The peer " + exist.node.peerID + " is replaced by\n** The peer " +
            k_bucket.node.peerID);
          T.table[index] = k_bucket;
        } else {
          console.log("Current value is closest, no update needed\n");
        }
      } else {
        // Insert the new k-bucket
      T.table[index] = k_bucket;
      let index1 = index + 1;
      console.log("Bucket P" + index1 + " has no value, adding " + P.peerID + "\n");
    }
  }
  }
}



// The method scans the k-buckets of T and send hello message packet to every peer P in T, one at a time. 
function sendHello(T) {
  let i = 0;
  // we use echoPeer method to do recursive method calls
  echoPeer(T, i);
}

// This method call itself (T.table.length) number of times,
// each time it sends hello messags to all peers in T
function echoPeer(T, i) {
  setTimeout(() => {
    if (i >= T.table.length) {
      console.log("All peers processed. Hello packets have been sent.\n");
      return;
    }
    if (T.table[i] && T.table[i].node && T.table[i].node.peerIP != "0.0.0.0") {
      let sock = new net.Socket();
      sock.connect(
        {
          port: T.table[i].node.peerPort,
          host: T.table[i].node.peerIP,
          localPort: T.owner.peerPort
        },
        () => {
          // Send Hello packet to the server
          kadPTPpacket.init(7, 2, T);
          sock.write(kadPTPpacket.getPacket(), () => {
            console.log("Hello packet sent to server at " + T.table[i].node.peerIP + ":" + T.table[i].node.peerPort);
          });
          setTimeout(() => {
            sock.end();
            sock.destroy();
          }, 5000);
        }
      );
      sock.on('close', () => {
        echoPeer(T, i + 1);
      });
      sock.on('error', (err) => {
        console.error("Error occurred while connecting to peer " + T.table[i].node.peerIP + ":" + T.table[i].node.peerPort + ": " + err.message);
        echoPeer(T, i + 1);
      });
    } else {
     // console.log("Error: Missing node information in DHTtable at index " + i);
      echoPeer(T, i + 1);
    }
  }, 5000);
}




function bytes2string(array) {
  var result = "";
  for (var i = 0; i < array.length; ++i) {
    if (array[i] > 0) result += String.fromCharCode(array[i]);
  }
  return result;
}

// return integer value of a subset bits
function parseBitPacket(packet, offset, length) {
  let number = "";
  for (var i = 0; i < length; i++) {
    // let us get the actual byte position of the offset
    let bytePosition = Math.floor((offset + i) / 8);
    let bitPosition = 7 - ((offset + i) % 8);
    let bit = (packet[bytePosition] >> bitPosition) % 2;
    number = (number << 1) | bit;
  }
  return number;
}


