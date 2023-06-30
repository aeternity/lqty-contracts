PNAME := -p lqty
all:
	node  -e  'require("./deployment/deploy.js").deploy("7c6e602a94f30e4ea7edabe4376314f69ba7eaa2f355ecedb339df847b6f0d80575f81ffb0a297b7725dc671da0b1769b1fc5cbe45385c7b5ad1fc2eaf1d609d")'
deploy-debug:
	node  --inspect-brk -e  'require("./deployment/deploy.js").deploy("7c6e602a94f30e4ea7edabe4376314f69ba7eaa2f355ecedb339df847b6f0d80575f81ffb0a297b7725dc671da0b1769b1fc5cbe45385c7b5ad1fc2eaf1d609d")'
install:
	npm install
run-node:
	docker-compose $(PNAME) up
start-node:
	docker-compose $(PNAME) up -d
stop-node:
	docker-compose $(PNAME) down -v
follow-log:
	docker-compose $(PNAME) logs -f
test-all: 
	npm run test
test: test-all
demo1: 
	npm test -- --grep "demo 1"
demo2: 
	npm test -- --grep "demo 2"
demo3: 
	npm test -- --grep "demo 3"
demo-oracle:
	npm test -- --grep "demo oracle"


