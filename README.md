# Worldwide COVID-19 Statistics

This project provides figures of Coronavirus (COVID-19) cases, recoveries and deaths from all over the world.
The website also displays historical charts of said figures throughout the years, as well as number of cases within the user's country.
Additional services includes newsletter subscription, as well as a feedback form.

## Deployment
### Project requirements
+ Node.js: https://nodejs.org/en
### Running the project locally
Run `start-local-server.bat` in master directory to start a local web server for this project. You can also manually do so using the following command in the project's local directory:
```
npx http-server ./ --cors -g
```
Where `./` is the project path. If your project is stored elsewhere, you can change it to the corresponding path.

You can also run the webserver with SSL enabled by adding `-S -C ssl/cert.pem -K ssl/key.pem` to the command above. These certificates are self-signed, so further work is required to gain access. It is recommended to run without SSL enabled for general testing.

## Notice
Newsletter system is not implemented. Currently, it only has a simple email validation.

Feedback system works by pushing a POST request to https://c19webfeedback.requestcatcher.com, which acts as our "mailbox". We can use it to view if the feedback was successfully sent.

As of this README's creation date, some endpoints no longer work, such as data graph for each country's history of infected cases.

## Endpoints
GET:
+ Country Codes: https://restcountries.com/v3.1
+ Flags: https://flagsapi.com/ OR https://flagcdn.com/
+ COVID-19 Current Data: https://covid-19.dataflowkit.com/v1\
+ COVID-19 Historical Data: https://corona.lmao.ninja/v2/
+ Location request: https://api.country.is/

POST:
+ Feedback: https://c19webfeedback.requestcatcher.com