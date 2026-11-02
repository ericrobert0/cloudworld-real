const err=(message,status)=>Object.assign(Error(message),{status});
export async function readBody(req,max=65536){
  if(!req.headers['content-type']?.startsWith('application/json'))throw err('Content-Type application/json obrigatorio',415);
  const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>max)throw err('Corpo excedeu limite',413);chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw err('JSON invalido',400);}
}
