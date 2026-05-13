cmake_minimum_required(VERSION 3.20)
project(trading_desktop LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 6.4 REQUIRED COMPONENTS Core Gui Qml Quick WebSockets)

qt_standard_project_setup()

qt_add_executable(trading_desktop
    main.cpp
    feed_client.h
    feed_client.cpp
)

qt_add_qml_module(trading_desktop
    URI trading_desktop
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/DepthView.qml
        qml/TradesRibbon.qml
)

target_link_libraries(trading_desktop PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::WebSockets
)
