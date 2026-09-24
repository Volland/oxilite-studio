// Management chains as paths.
MATCH p = (m:Manager)-[:manages*1..3]->(e)
RETURN p
