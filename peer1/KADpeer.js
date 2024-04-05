let net = require("net"),
  singleton = require("./Singleton"),
  handler = require("./PeersHandler");
let os = require("os");

singleton.init();


// get current folder name
let path = __dirname.split("\\");
const args = process.argv.slice(3);
let myName = process.argv[3];
//let myName = path[path.length - 1];

let ifaces = os.networkInterfaces();
let HOST = "";
let PORT = singleton.getPort(); //get random port number

// get the loaclhost ip address
Object.keys(ifaces).forEach(function (ifname) {
  ifaces[ifname].forEach(function (iface) {
    if ("IPv4" == iface.family && iface.internal !== false) {
      HOST = iface.address;
    }
  });
});



let serverID = singleton.getPeerID(HOST, PORT);



if (process.argv.length > 4 && process.argv[4]=== '-p') {
  // call as node KADpeer [-p <serverIP>:<port>]

  // This peer runs as a client
  // this needs more work to validate the command line arguments
  let firstFlag = process.argv[4]; // should be -p
  let hostserverIPandPort = process.argv[5].split(":");
  let knownHOST = hostserverIPandPort[0];
  let knownPORT = hostserverIPandPort[1];

  // connect to the known peer address (any peer act as a server)
  let clientSocket = new net.Socket();
  let port = singleton.getPort();
  clientSocket.connect({ port: knownPORT, host: knownHOST, localPort: port }, () => {
    // initialize client DHT table
    let clientID = singleton.getPeerID(clientSocket.localAddress, port)
    let clientPeer = {
      peerName: process.argv[3], // client name
      peerIP: clientSocket.localAddress,
      peerPort: port,
      peerID: clientID
    };

    let clientDHTtable = {
      owner: clientPeer,
      table: []
    }

    handler.handleCommunications(clientSocket, myName /*client name*/, clientDHTtable);
  });

} else {
  // call as node peer (no arguments)
  // run as a server
  let serverSocket = net.createServer();
  serverSocket.listen(PORT, HOST);
  console.log(
    "This peer address is " + HOST + ":" + PORT + " located at " + myName /*server name*/ + " [" + serverID + "]"
  );

  // initialize server DHT table
  let serverPeer = {
    peerName: myName,
    peerIP: HOST,
    peerPort: PORT,
    peerID: serverID
  };

  let serverDHTtable = {
    owner: serverPeer,
    table: []
  }

  serverSocket.on("connection", function (sock) {
    // received connection request
    handler.handleClientJoining(sock, serverDHTtable);
  });

}
