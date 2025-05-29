# qewd-client-node
A refactor of qewd-client for use in a node app which wants to connect to a qewd-server.

The original [qewd-client](https://github.com/robtweed/qewd-client) is specifically designed for use in a browser and thus it is closely tied to the DOM.
Node id DOM-less. However for things like running tests of your qewd-server websocket app surface, 
it's quite handy to have a library that can connect to qewd-server from node and send / receive messages – which is what this version does.
- This is a port of qewd-client v2.0.0

## License

 Copyright (c) 2020 M/Gateway Developments Ltd,                           
 Redhill, Surrey UK.                                                      
 All rights reserved.                                                     
                                                                           
  http://www.mgateway.com                                                  
  Email: rtweed@mgateway.com                                               
                                                                           
                                                                           
  Licensed under the Apache License, Version 2.0 (the "License");          
  you may not use this file except in compliance with the License.         
  You may obtain a copy of the License at                                  
                                                                           
      http://www.apache.org/licenses/LICENSE-2.0                           
                                                                           
  Unless required by applicable law or agreed to in writing, software      
  distributed under the License is distributed on an "AS IS" BASIS,        
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
  See the License for the specific language governing permissions and      
   limitations under the License.   
